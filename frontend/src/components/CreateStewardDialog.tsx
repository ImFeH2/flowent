import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, FolderGit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createSteward, listBranches } from "@/lib/api";

interface CreateStewardDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateStewardDialog({
  open,
  onClose,
}: CreateStewardDialogProps) {
  const [repoPath, setRepoPath] = useState("");
  const [name, setName] = useState("Steward");
  const [branch, setBranch] = useState("main");
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [creating, setCreating] = useState(false);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  useEffect(() => {
    if (!open) return;
    const trimmed = repoPath.trim();
    if (!trimmed) {
      setBranches([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingBranches(true);
      try {
        const result = await listBranches(trimmed);
        if (!cancelled) {
          setBranches(result);
          if (result.length > 0 && !result.includes(branch)) {
            setBranch(result[0]);
          }
        }
      } catch {
        if (!cancelled) setBranches([]);
      } finally {
        if (!cancelled) setLoadingBranches(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [repoPath, open, branch]);

  const handleCreate = async () => {
    if (!repoPath.trim()) {
      toast.error("Repository path is required");
      return;
    }
    setCreating(true);
    try {
      await createSteward({
        repo_path: repoPath.trim(),
        name: name.trim() || "Steward",
        branch,
      });
      toast.success("Steward created");
      onClose();
      setRepoPath("");
      setName("Steward");
      setBranch("main");
      setBranches([]);
    } catch {
      toast.error("Failed to create steward");
    } finally {
      setCreating(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (
      mouseDownTargetRef.current === e.currentTarget &&
      e.target === e.currentTarget
    ) {
      onClose();
    }
    mouseDownTargetRef.current = null;
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onMouseDown={(e) => {
          mouseDownTargetRef.current = e.target;
        }}
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", duration: 0.3 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900/95 shadow-2xl backdrop-blur overflow-hidden"
        >
          <div className="flex items-center gap-3 border-b border-zinc-800 px-6 py-4">
            <FolderGit2 className="size-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-zinc-100">
              Create Steward
            </h2>
            <button
              onClick={onClose}
              className="ml-auto rounded p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-1.5">
                Repository Path
              </label>
              <input
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="/path/to/your/repo"
                autoFocus
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-1.5">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Steward"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-1.5">
                Branch
                {loadingBranches && (
                  <Loader2 className="inline size-3 ml-1.5 animate-spin text-zinc-500" />
                )}
              </label>
              {branches.length > 0 ? (
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
              disabled={creating || !repoPath.trim()}
            >
              {creating ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
