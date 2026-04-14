import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wrench,
  Plus,
  Globe,
  Webhook,
  Database,
  Code2,
  Brain,
  Key,
  Lock,
  ShieldCheck,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Activity,
  Clock,
  FlaskConical,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

interface CustomTool {
  id: string;
  ownerId: number;
  name: string;
  description: string;
  toolType: string;
  endpoint: string | null;
  method: string | null;
  headers: string | null;
  authType: string | null;
  authConfig: string | null;
  inputSchema: string | null;
  outputSchema: string | null;
  isActive: number;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const TOOL_TYPES = [
  { value: "rest_api", label: "REST API", icon: Globe },
  { value: "webhook", label: "Webhook", icon: Webhook },
  { value: "database", label: "Database", icon: Database },
  { value: "browser_script", label: "Browser Script", icon: Code2 },
  { value: "ai_model", label: "AI Model", icon: Brain },
];

const AUTH_TYPES = [
  { value: "none", label: "None" },
  { value: "api_key", label: "API Key" },
  { value: "oauth2", label: "OAuth2" },
  { value: "basic", label: "Basic Auth" },
];

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

function getToolTypeInfo(toolType: string) {
  return TOOL_TYPES.find((t) => t.value === toolType) ?? TOOL_TYPES[0];
}

function getAuthLabel(authType: string | null) {
  return AUTH_TYPES.find((a) => a.value === (authType ?? "none"))?.label ?? "None";
}

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ToolCard({
  tool,
  onEdit,
  onDelete,
  onToggle,
}: {
  tool: CustomTool;
  onEdit: (tool: CustomTool) => void;
  onDelete: (tool: CustomTool) => void;
  onToggle: (tool: CustomTool) => void;
}) {
  const { icon: TypeIcon, label: typeLabel } = getToolTypeInfo(tool.toolType);
  const isActive = tool.isActive === 1;

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-primary/40 transition-colors group">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <TypeIcon className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm text-foreground truncate">{tool.name}</h3>
            {/* Active indicator */}
            <span className="flex items-center gap-1">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isActive ? "bg-green-500" : "bg-muted-foreground/40"
                }`}
              />
              <span className={`text-[11px] ${isActive ? "text-green-500" : "text-muted-foreground"}`}>
                {isActive ? "Active" : "Inactive"}
              </span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground border border-border">
          <TypeIcon style={{ width: 11, height: 11 }} />
          {typeLabel}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground border border-border">
          <Key style={{ width: 11, height: 11 }} />
          {getAuthLabel(tool.authType)}
        </span>
        {tool.method && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-xs text-primary border border-primary/20 font-mono font-medium">
            {tool.method}
          </span>
        )}
      </div>

      {/* Endpoint */}
      {tool.endpoint && (
        <div className="flex items-center gap-2 bg-secondary/60 rounded-md px-3 py-1.5 min-w-0">
          <Globe className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-mono text-muted-foreground truncate">{tool.endpoint}</span>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3 mt-auto">
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          {tool.usageCount} calls
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDate(tool.lastUsedAt)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => onEdit(tool)}
        >
          <Pencil className="w-3 h-3" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => onToggle(tool)}
        >
          {isActive ? (
            <ToggleRight className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <ToggleLeft className="w-3.5 h-3.5" />
          )}
          {isActive ? "Disable" : "Enable"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(tool)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  name: "",
  description: "",
  toolType: "rest_api",
  endpoint: "",
  method: "POST",
  headers: "",
  authType: "none",
  authConfig: "",
  inputSchema: "",
  outputSchema: "",
};

type FormState = typeof EMPTY_FORM;

function ToolModal({
  open,
  onClose,
  editingTool,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  editingTool: CustomTool | null;
  onSave: (data: FormState) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<FormState>(() => {
    if (editingTool) {
      return {
        name: editingTool.name,
        description: editingTool.description,
        toolType: editingTool.toolType,
        endpoint: editingTool.endpoint ?? "",
        method: editingTool.method ?? "POST",
        headers: editingTool.headers ?? "",
        authType: editingTool.authType ?? "none",
        authConfig: editingTool.authConfig ?? "",
        inputSchema: editingTool.inputSchema ?? "",
        outputSchema: editingTool.outputSchema ?? "",
      };
    }
    return EMPTY_FORM;
  });

  // Reset form when modal opens/closes or editing tool changes
  const key = editingTool ? editingTool.id : "new";

  const set = (field: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {editingTool ? "Edit Tool" : "New Tool"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <Input
              placeholder="My REST API Tool"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="bg-background border-border"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description *</label>
            <Textarea
              placeholder="Describe what this tool does and when to use it..."
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="bg-background border-border resize-none h-20 text-sm"
            />
          </div>

          {/* Tool type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tool Type</label>
            <Select value={form.toolType} onValueChange={(v) => set("toolType", v)}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {TOOL_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex items-center gap-2">
                      <t.icon className="w-3.5 h-3.5" />
                      {t.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Endpoint + Method */}
          <div className="flex gap-2">
            <div className="space-y-1.5 flex-1">
              <label className="text-xs font-medium text-muted-foreground">Endpoint URL</label>
              <Input
                placeholder="https://api.example.com/v1/data"
                value={form.endpoint}
                onChange={(e) => set("endpoint", e.target.value)}
                className="bg-background border-border font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5 w-28">
              <label className="text-xs font-medium text-muted-foreground">Method</label>
              <Select value={form.method} onValueChange={(v) => set("method", v)}>
                <SelectTrigger className="bg-background border-border font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {HTTP_METHODS.map((m) => (
                    <SelectItem key={m} value={m} className="font-mono">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Headers */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Headers <span className="text-muted-foreground/60 font-normal">(JSON)</span>
            </label>
            <Textarea
              placeholder={'{\n  "Content-Type": "application/json"\n}'}
              value={form.headers}
              onChange={(e) => set("headers", e.target.value)}
              className="bg-background border-border resize-none h-20 font-mono text-xs"
            />
          </div>

          {/* Auth type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Auth Type</label>
            <Select value={form.authType} onValueChange={(v) => set("authType", v)}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {AUTH_TYPES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auth config */}
          {form.authType !== "none" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Auth Config <span className="text-muted-foreground/60 font-normal">(JSON)</span>
              </label>
              <Textarea
                placeholder={
                  form.authType === "api_key"
                    ? '{\n  "key": "X-API-Key",\n  "value": "YOUR_KEY"\n}'
                    : form.authType === "oauth2"
                    ? '{\n  "clientId": "...",\n  "clientSecret": "...",\n  "tokenUrl": "..."\n}'
                    : '{\n  "username": "...",\n  "password": "..."\n}'
                }
                value={form.authConfig}
                onChange={(e) => set("authConfig", e.target.value)}
                className="bg-background border-border resize-none h-24 font-mono text-xs"
              />
            </div>
          )}

          {/* Input schema */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Input Schema <span className="text-muted-foreground/60 font-normal">(JSON Schema)</span>
            </label>
            <Textarea
              placeholder={'{\n  "type": "object",\n  "properties": {\n    "query": { "type": "string" }\n  },\n  "required": ["query"]\n}'}
              value={form.inputSchema}
              onChange={(e) => set("inputSchema", e.target.value)}
              className="bg-background border-border resize-none h-24 font-mono text-xs"
            />
          </div>

          {/* Output schema */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Output Schema <span className="text-muted-foreground/60 font-normal">(JSON Schema)</span>
            </label>
            <Textarea
              placeholder={'{\n  "type": "object",\n  "properties": {\n    "result": { "type": "string" }\n  }\n}'}
              value={form.outputSchema}
              onChange={(e) => set("outputSchema", e.target.value)}
              className="bg-background border-border resize-none h-24 font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-row">
          {/* Test button — disabled/future */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="outline" disabled className="gap-1.5 text-xs h-8">
                  <FlaskConical className="w-3.5 h-3.5" />
                  Test
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Coming soon</TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => onSave(form)}
            disabled={isSaving || !form.name.trim() || !form.description.trim()}
          >
            {isSaving ? (
              <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            ) : null}
            {editingTool ? "Save Changes" : "Create Tool"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ToolsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<CustomTool | null>(null);
  const [deletingTool, setDeletingTool] = useState<CustomTool | null>(null);

  const { data: tools = [], isLoading } = useQuery<CustomTool[]>({
    queryKey: ["/api/tools"],
    queryFn: async () => {
      const res = await fetch("/api/tools", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tools");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          toolType: data.toolType,
          endpoint: data.endpoint || null,
          method: data.method,
          headers: data.headers || null,
          authType: data.authType,
          authConfig: data.authConfig || null,
          inputSchema: data.inputSchema || null,
          outputSchema: data.outputSchema || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tools"] });
      setModalOpen(false);
      setEditingTool(null);
      toast({ title: "Tool created", description: "Your tool has been saved." });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FormState> | { isActive: number } }) => {
      const res = await fetch(`/api/tools/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tools"] });
      setModalOpen(false);
      setEditingTool(null);
      toast({ title: "Tool updated" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tools/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tools"] });
      setDeletingTool(null);
      toast({ title: "Tool deleted" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingTool(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (tool: CustomTool) => {
    setEditingTool(tool);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingTool(null);
  };

  const handleSave = (form: FormState) => {
    if (editingTool) {
      updateMutation.mutate({
        id: editingTool.id,
        data: {
          name: form.name,
          description: form.description,
          toolType: form.toolType,
          endpoint: form.endpoint || null,
          method: form.method,
          headers: form.headers || null,
          authType: form.authType,
          authConfig: form.authConfig || null,
          inputSchema: form.inputSchema || null,
          outputSchema: form.outputSchema || null,
        } as any,
      });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleToggle = (tool: CustomTool) => {
    const newActive = tool.isActive === 1 ? 0 : 1;
    updateMutation.mutate({
      id: tool.id,
      data: { isActive: newActive } as any,
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tools</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect APIs, databases, and services to your agents
          </p>
        </div>
        <Button size="sm" className="gap-1.5 h-8 text-xs shrink-0" onClick={handleOpenCreate}>
          <Plus className="w-3.5 h-3.5" />
          New Tool
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-52" />
          ))}
        </div>
      ) : tools.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Wrench className="w-7 h-7 text-primary/60" />
          </div>
          <h2 className="font-semibold text-foreground mb-1">No tools yet</h2>
          <p className="text-sm text-muted-foreground max-w-xs mb-5">
            Create your first tool to connect external services to your AI agents
          </p>
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleOpenCreate}>
            <Plus className="w-3.5 h-3.5" />
            New Tool
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              onEdit={handleOpenEdit}
              onDelete={setDeletingTool}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <ToolModal
          open={modalOpen}
          onClose={handleModalClose}
          editingTool={editingTool}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingTool} onOpenChange={(v) => !v && setDeletingTool(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{deletingTool?.name}</span>? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-8 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deletingTool && deleteMutation.mutate(deletingTool.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
