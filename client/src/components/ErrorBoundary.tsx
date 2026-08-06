import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  remountKey: number;
}

/** Chrome Translate / extensões mexem no DOM e o React estoura removeChild. */
function isTransientDomError(error: Error | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message || "";
  return (
    error.name === "NotFoundError" ||
    msg.includes("removeChild") ||
    msg.includes("insertBefore") ||
    msg.includes("The node to be removed is not a child")
  );
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, remountKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    if (isTransientDomError(error)) {
      // Remonta a árvore — não mostra tela vermelha por bug de tradução do Chrome
      return { hasError: false, error: null, remountKey: Date.now() };
    }
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4 uppercase tracking-wide">
              Um erro inesperado ocorreu.
            </h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return <div key={this.state.remountKey}>{this.props.children}</div>;
  }
}

export default ErrorBoundary;
