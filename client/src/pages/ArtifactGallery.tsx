import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Layers, Star, Trash2, Eye, Code, Image, FileText,
  Search, Filter, Download, ExternalLink, Heart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ArtifactItem {
  id: string;
  title: string;
  type: string;
  content: string;
  language: string | null;
  source_type: string | null;
  tags: string | null;
  is_favorite: number;
  view_count: number;
  created_at: number;
}

const TYPE_ICONS: Record<string, any> = {
  html: Code,
  svg: Image,
  code: Code,
  image: Image,
  document: FileText,
};

const TYPE_COLORS: Record<string, string> = {
  html: "text-orange-400 bg-orange-500/10",
  svg: "text-pink-400 bg-pink-500/10",
  code: "text-emerald-400 bg-emerald-500/10",
  image: "text-purple-400 bg-purple-500/10",
  document: "text-blue-400 bg-blue-500/10",
};

export default function ArtifactGallery() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactItem | null>(null);
  const [previewMode, setPreviewMode] = useState<"preview" | "code">("preview");

  const { data: artifacts = [], isLoading } = useQuery<ArtifactItem[]>({
    queryKey: ["/api/artifacts", typeFilter, favOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (favOnly) params.set("favorite", "1");
      const res = await fetch(`/api/artifacts?${params}`);
      return res.json();
    },
  });

  const favMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/artifacts/${id}/favorite`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/artifacts"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/artifacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artifacts"] });
      setSelectedArtifact(null);
      toast({ title: "Artifact deleted" });
    },
  });

  const filtered = searchQuery
    ? artifacts.filter(a =>
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : artifacts;

  return (
    <div className="flex h-full">
      {/* Main gallery */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Layers className="w-6 h-6 text-primary" />
                Artifact Gallery
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Browse, preview, and reuse all generated artifacts
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {artifacts.length} artifacts
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mt-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search artifacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>

            {["all", "html", "svg", "code", "image", "document"].map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  typeFilter === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                {t === "all" ? "All" : t.toUpperCase()}
              </button>
            ))}

            <button
              onClick={() => setFavOnly(!favOnly)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                favOnly ? "bg-amber-500/15 text-amber-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Star className="w-3 h-3" />
              Favorites
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Layers className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No artifacts yet</p>
              <p className="text-xs mt-1">Artifacts from AI conversations and pipelines will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map(artifact => {
                const Icon = TYPE_ICONS[artifact.type] || Code;
                const colorClass = TYPE_COLORS[artifact.type] || "text-gray-400 bg-gray-500/10";

                return (
                  <div
                    key={artifact.id}
                    onClick={() => setSelectedArtifact(artifact)}
                    className={`rounded-xl border border-border/30 bg-card/50 overflow-hidden cursor-pointer transition-all hover:border-primary/30 hover:shadow-lg ${
                      selectedArtifact?.id === artifact.id ? "ring-2 ring-primary/50" : ""
                    }`}
                  >
                    {/* Preview area */}
                    <div className="h-32 bg-black/20 relative overflow-hidden">
                      {artifact.type === "html" || artifact.type === "svg" ? (
                        <iframe
                          srcDoc={artifact.content}
                          className="w-full h-full border-0 pointer-events-none"
                          sandbox=""
                          title={artifact.title}
                        />
                      ) : artifact.type === "image" ? (
                        <img src={artifact.content} alt={artifact.title} className="w-full h-full object-cover" />
                      ) : (
                        <pre className="p-2 text-[8px] text-foreground/50 overflow-hidden h-full">
                          {artifact.content.slice(0, 300)}
                        </pre>
                      )}

                      {/* Favorite badge */}
                      {artifact.is_favorite === 1 && (
                        <div className="absolute top-2 right-2">
                          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-5 h-5 rounded flex items-center justify-center ${colorClass}`}>
                          <Icon className="w-3 h-3" />
                        </div>
                        <p className="text-xs font-medium text-foreground truncate flex-1">{artifact.title}</p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{artifact.type}</span>
                        {artifact.language && <span>/ {artifact.language}</span>}
                        <span className="ml-auto">{new Date(artifact.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedArtifact && (
        <div className="w-96 border-l border-border/30 flex flex-col bg-card/50">
          <div className="p-4 border-b border-border/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground truncate">{selectedArtifact.title}</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => favMutation.mutate(selectedArtifact.id)}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                >
                  <Heart className={`w-4 h-4 ${selectedArtifact.is_favorite ? "text-red-400 fill-red-400" : "text-muted-foreground"}`} />
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([selectedArtifact.content], { type: "text/html" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `${selectedArtifact.title}.${selectedArtifact.type === "html" ? "html" : selectedArtifact.language || "txt"}`;
                    a.click(); URL.revokeObjectURL(url);
                  }}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                >
                  <Download className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => deleteMutation.mutate(selectedArtifact.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewMode("preview")}
                className={`px-2.5 py-1 rounded text-xs font-medium ${
                  previewMode === "preview" ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >Preview</button>
              <button
                onClick={() => setPreviewMode("code")}
                className={`px-2.5 py-1 rounded text-xs font-medium ${
                  previewMode === "code" ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >Code</button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {previewMode === "preview" ? (
              selectedArtifact.type === "html" || selectedArtifact.type === "svg" ? (
                <iframe
                  srcDoc={selectedArtifact.content}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts"
                  title={selectedArtifact.title}
                />
              ) : (
                <pre className="p-4 text-xs text-foreground/70 whitespace-pre-wrap">{selectedArtifact.content}</pre>
              )
            ) : (
              <pre className="p-4 text-xs text-foreground/70 whitespace-pre-wrap font-mono bg-black/20">
                {selectedArtifact.content}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
