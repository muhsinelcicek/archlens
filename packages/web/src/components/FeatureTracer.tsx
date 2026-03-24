import { useState, useCallback } from "react";
import type { ArchModel } from "../lib/store.js";
import type { ArchGraphHandle } from "./ArchGraph.js";
import { Play, Pause, SkipForward, SkipBack, Square, ChevronDown, Lightbulb, ArrowRight } from "lucide-react";

interface FeatureTracerProps {
  model: ArchModel;
  graphRef: React.RefObject<ArchGraphHandle | null>;
  className?: string;
}

export function FeatureTracer({ model, graphRef, className = "" }: FeatureTracerProps) {
  const processes = model.businessProcesses || [];
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const process = processes.find((p) => p.id === selectedProcess);

  const play = useCallback(() => {
    if (!process || !graphRef.current) return;

    // Map steps to graph node IDs
    const nodeIds: string[] = [];
    for (const step of process.steps) {
      // Try to find the module that contains this step's symbolRef
      const mod = model.modules.find((m) =>
        step.symbolRef?.includes(m.name + "/") || step.name.toLowerCase().includes(m.name.toLowerCase()),
      );
      if (mod) nodeIds.push(mod.name);
    }

    // Fallback: use data source modules + output modules
    if (nodeIds.length === 0) {
      for (const ds of process.dataSources) {
        const mod = model.modules.find((m) => m.name.toLowerCase().includes(ds.name.toLowerCase().split(" ")[0]));
        if (mod) nodeIds.push(mod.name);
      }
    }

    if (nodeIds.length > 0) {
      graphRef.current.animateFlow(nodeIds, 1200);
      setIsPlaying(true);
    }
  }, [process, graphRef, model]);

  const stop = useCallback(() => {
    graphRef.current?.stopAnimation();
    setIsPlaying(false);
    setCurrentStep(0);
  }, [graphRef]);

  const goToStep = useCallback((step: number) => {
    if (!process) return;
    setCurrentStep(Math.max(0, Math.min(step, process.steps.length - 1)));
  }, [process]);

  if (processes.length === 0) {
    return (
      <div className={`text-center text-zinc-600 text-xs py-4 ${className}`}>
        No business processes detected
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-3">
        {/* Process Selector */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors min-w-[200px]"
          >
            <span className="truncate">{process?.name || "Select a process..."}</span>
            <ChevronDown className="h-3 w-3 flex-shrink-0" />
          </button>

          {showDropdown && (
            <div className="absolute bottom-full left-0 mb-1 w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
              {processes.filter((p) => p.category !== "presentation" && p.category !== "api-service").map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProcess(p.id); setShowDropdown(false); setCurrentStep(0); stop(); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 transition-colors ${selectedProcess === p.id ? "bg-zinc-800 text-archlens-400" : "text-zinc-300"}`}
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-zinc-600 mt-0.5">{p.steps.length} steps — {p.category}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Playback Controls */}
        {process && (
          <>
            <div className="flex items-center gap-1">
              <button onClick={() => goToStep(currentStep - 1)} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300" disabled={currentStep === 0}>
                <SkipBack className="h-3.5 w-3.5" />
              </button>
              {isPlaying ? (
                <button onClick={stop} className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30">
                  <Square className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button onClick={play} className="p-1.5 rounded-lg bg-archlens-500/20 text-archlens-400 hover:bg-archlens-500/30">
                  <Play className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => goToStep(currentStep + 1)} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300" disabled={currentStep >= (process?.steps.length || 1) - 1}>
                <SkipForward className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="text-[10px] text-zinc-600">
              Step {currentStep + 1}/{process.steps.length}
            </div>

            {/* Mini pipeline */}
            <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
              {process.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-0.5 flex-shrink-0">
                  {i > 0 && <ArrowRight className="h-2.5 w-2.5 text-zinc-700" />}
                  <button
                    onClick={() => goToStep(i)}
                    className={`px-2 py-0.5 rounded text-[9px] font-medium whitespace-nowrap transition-colors ${
                      i === currentStep
                        ? "bg-archlens-500/20 text-archlens-400 border border-archlens-500/30"
                        : i < currentStep
                          ? "bg-zinc-800 text-zinc-400"
                          : "text-zinc-600 hover:text-zinc-400"
                    }`}
                  >
                    {step.name}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Current Step Detail */}
      {process && process.steps[currentStep] && (
        <div className="mt-2 rounded-lg bg-zinc-800/30 border border-zinc-800/50 px-3 py-2">
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-archlens-500/20 flex items-center justify-center text-[10px] font-bold text-archlens-400 mt-0.5">
              {currentStep + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-zinc-200">{process.steps[currentStep].name}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{process.steps[currentStep].description}</div>
              <div className="flex items-center gap-2 mt-1 text-[9px] font-mono">
                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{process.steps[currentStep].inputData}</span>
                <ArrowRight className="h-2.5 w-2.5 text-zinc-600" />
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{process.steps[currentStep].outputData}</span>
              </div>
              {process.steps[currentStep].algorithm && (
                <div className="mt-1.5 flex items-start gap-1 text-[9px] text-amber-400/80">
                  <Lightbulb className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span className="font-mono">{process.steps[currentStep].algorithm}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
