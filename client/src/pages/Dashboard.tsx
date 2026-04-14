import { useMemo, useCallback, useRef } from "react";
import { Grip, Lock, Unlock, X, Save, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// @ts-expect-error — react-grid-layout v2 ESM exports differ from @types (v1)
import { ResponsiveGridLayout, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { WIDGET_REGISTRY, DEFAULT_LAYOUT } from "@/components/dashboard/widgets";
import { useDashboardLayout } from "@/components/dashboard/useDashboardLayout";
import { WidgetCatalog } from "@/components/dashboard/WidgetCatalog";

export default function Dashboard() {
  const {
    layout,
    editMode,
    setEditMode,
    onLayoutChange,
    addWidget,
    removeWidget,
    isLoading,
    isSaving,
  } = useDashboardLayout();

  const { containerRef, width } = useContainerWidth({ initialWidth: 1200 });

  // Build a map of widget definitions
  const widgetMap = useMemo(() => {
    const map = new Map<string, (typeof WIDGET_REGISTRY)[number]>();
    for (const w of WIDGET_REGISTRY) map.set(w.id, w);
    return map;
  }, []);

  // Compute layout with static flags for locking
  const gridLayout = useMemo(() => {
    return layout.map(l => ({ ...l, static: !editMode }));
  }, [layout, editMode]);

  // Active widgets based on current layout
  const activeWidgets = useMemo(() => {
    return gridLayout
      .map(l => ({ layout: l, def: widgetMap.get(l.i) }))
      .filter((w): w is { layout: typeof w.layout; def: NonNullable<typeof w.def> } => !!w.def);
  }, [gridLayout, widgetMap]);

  const handleLayoutChange = useCallback(
    (newLayout: any[]) => {
      if (editMode) {
        onLayoutChange(newLayout);
      }
    },
    [editMode, onLayoutChange]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Bunz command center — real-time metrics & controls</p>
          </div>
          <div className="flex items-center gap-2">
            {editMode && (
              <WidgetCatalog layout={layout} onAdd={addWidget} />
            )}
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? <><Lock className="w-4 h-4" /> Lock Layout</> : <><Unlock className="w-4 h-4" /> Edit Mode</>}
            </Button>
            {isSaving && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Save className="w-3 h-3 animate-pulse" /> Saving...
              </div>
            )}
          </div>
        </div>

        {/* Grid Layout — nuclear lock: pointer-events:none on wrapper blocks
            all drag/resize at the grid level; pointer-events:auto on widget
            content keeps buttons/links/text interactive when locked. */}
        <div ref={containerRef} className={!editMode ? "pointer-events-none" : ""}>
          <ResponsiveGridLayout
            className="layout"
            width={width}
            layouts={{ lg: gridLayout }}
            breakpoints={{ lg: 1200, md: 900, sm: 600 }}
            cols={{ lg: 12, md: 9, sm: 6 }}
            rowHeight={60}
            isDraggable={editMode}
            isResizable={editMode}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".drag-handle"
            compactType="vertical"
            margin={[16, 16]}
          >
            {activeWidgets.map(({ layout: l, def }) => {
              const WidgetComponent = def.component;
              return (
                <div key={l.i} data-grid={{ ...l, minW: def.minW, minH: def.minH }}>
                  <Card className={`h-full bg-card border border-border hover:border-border/80 transition-colors overflow-hidden relative group ${!editMode ? "pointer-events-auto" : ""}`}>
                    {/* Edit mode controls */}
                    {editMode && (
                      <>
                        <div className="drag-handle absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-muted/40 to-transparent cursor-move flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <Grip className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <button
                          onClick={() => removeWidget(l.i)}
                          className="absolute top-1 right-1 p-1 rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    <CardContent className="h-full pt-4 pb-3 px-4">
                      <WidgetComponent {...(def.props || {})} />
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </ResponsiveGridLayout>
        </div>

        {/* Empty state when no widgets */}
        {activeWidgets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-lg font-medium mb-2">No widgets on your dashboard</p>
            <p className="text-sm mb-4">Click "Edit Mode" and then "Add Widget" to customize your dashboard.</p>
            <Button variant="outline" onClick={() => setEditMode(true)}>
              <Unlock className="w-4 h-4 mr-2" /> Enter Edit Mode
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
