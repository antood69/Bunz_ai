import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { DEFAULT_LAYOUT } from "./widgets";

interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

/** Strip extra properties react-grid-layout adds (static, moved, isBounded, etc.) */
function sanitizeLayout(layout: any[]): LayoutItem[] {
  return layout.map(({ i, x, y, w, h, minW, minH }) => {
    const item: LayoutItem = { i, x, y, w, h };
    if (minW !== undefined) item.minW = minW;
    if (minH !== undefined) item.minH = minH;
    return item;
  });
}

export function useDashboardLayout() {
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

  // Load saved layout
  const { data: savedData, isLoading } = useQuery<{ layout: LayoutItem[] | null }>({
    queryKey: ["/api/dashboard/layout"],
  });

  const [localLayout, setLocalLayout] = useState<LayoutItem[] | null>(null);

  // Sync from server when data arrives — hydrate once on initial load
  useEffect(() => {
    if (!savedData) return;
    if (savedData.layout && Array.isArray(savedData.layout) && savedData.layout.length > 0) {
      if (!hydratedRef.current) {
        setLocalLayout(savedData.layout);
        hydratedRef.current = true;
      }
    } else if (!hydratedRef.current) {
      // Server returned null/empty — use default
      setLocalLayout(DEFAULT_LAYOUT);
      hydratedRef.current = true;
    }
  }, [savedData]);

  // The active layout: local override > server saved > default
  const layout: LayoutItem[] = localLayout || savedData?.layout || DEFAULT_LAYOUT;

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (newLayout: LayoutItem[]) => {
      await apiRequest("PUT", "/api/dashboard/layout", { layout: newLayout });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/layout"] });
    },
  });

  // Debounced save (2s after last change) — only save when in edit mode
  const onLayoutChange = useCallback(
    (newLayout: LayoutItem[]) => {
      if (!editMode) return; // Ignore layout changes when not editing (e.g. initial mount)
      const sanitized = sanitizeLayout(newLayout);
      setLocalLayout(sanitized);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveMutation.mutate(sanitized);
      }, 2000);
    },
    [editMode, saveMutation]
  );

  // Add a widget to the layout
  const addWidget = useCallback(
    (widgetId: string, defaultW: number, defaultH: number) => {
      if (layout.some(l => l.i === widgetId)) return;
      const maxY = layout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
      const newItem: LayoutItem = { i: widgetId, x: 0, y: maxY, w: defaultW, h: defaultH };
      const newLayout = [...layout, newItem];
      setLocalLayout(newLayout);
      saveMutation.mutate(newLayout);
    },
    [layout, saveMutation]
  );

  // Remove a widget from the layout
  const removeWidget = useCallback(
    (widgetId: string) => {
      const newLayout = layout.filter(l => l.i !== widgetId);
      setLocalLayout(newLayout);
      saveMutation.mutate(newLayout);
    },
    [layout, saveMutation]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    layout,
    editMode,
    setEditMode,
    onLayoutChange,
    addWidget,
    removeWidget,
    isLoading,
    isSaving: saveMutation.isPending,
  };
}
