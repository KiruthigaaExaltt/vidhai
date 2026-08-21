import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center gap-4">
          <div>
            <h1 className="text-xl font-semibold">This screen could not be opened</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The application hit a runtime error while loading this module.
            </p>
          </div>
          <pre className="max-h-64 overflow-auto rounded-sm border bg-muted/40 p-3 text-xs text-muted-foreground">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2">
            <Button className="rounded-sm" onClick={() => window.location.assign("/dashboard")}>
              Go to Dashboard
            </Button>
            <Button variant="outline" className="rounded-sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}