import { useState } from "react";
import {
  useListAlertColors,
  useCreateAlertColor,
  useDeleteAlertColor,
} from "@workspace/api-client-react";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListAlertColorsQueryKey } from "@workspace/api-client-react";

export default function AlertColors() {
  const queryClient = useQueryClient();
  const { data: colors, isLoading } = useListAlertColors();
  const createMutation = useCreateAlertColor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListAlertColorsQueryKey(),
        });
        setIsOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteAlertColor({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getListAlertColorsQueryKey(),
        }),
    },
  });

  const [isOpen, setIsOpen] = useState(false);
  const colorPagination = useClientPagination(colors ?? []);
  const [formData, setFormData] = useState({
    name: "",
    hexColor: "#21C7B3",
    condition: "",
    description: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData });
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Alert Colors
          </h1>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-sm font-medium h-9">
              <Plus className="w-4 h-4 mr-2" /> Add Color
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-sm border-border shadow-none max-w-md">
            <DialogHeader>
              <DialogTitle>Add Alert Color</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Name
                  </Label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="rounded-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Hex Color
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      required
                      value={formData.hexColor}
                      onChange={(e) =>
                        setFormData({ ...formData, hexColor: e.target.value })
                      }
                      className="w-12 p-1 rounded-sm h-9"
                    />
                    <Input
                      required
                      value={formData.hexColor}
                      onChange={(e) =>
                        setFormData({ ...formData, hexColor: e.target.value })
                      }
                      className="flex-1 rounded-sm font-mono"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Condition (Exact Match)
                </Label>
                <Input
                  required
                  value={formData.condition}
                  onChange={(e) =>
                    setFormData({ ...formData, condition: e.target.value })
                  }
                  className="rounded-sm font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Description
                </Label>
                <Input
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="rounded-sm"
                />
              </div>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full rounded-sm"
              >
                Save Color
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-sm border-border shadow-none">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Color Registry
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            <>
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium w-16">Swatch</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Hex</th>
                    <th className="px-4 py-2 font-medium">Condition</th>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {colorPagination.paginatedRows.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 h-[40px]">
                      <td className="px-4">
                        <div
                          className="w-6 h-6 rounded-sm border"
                          style={{ backgroundColor: c.hexColor }}
                        ></div>
                      </td>
                      <td className="px-4 font-medium">{c.name}</td>
                      <td className="px-4 font-mono text-muted-foreground">
                        {c.hexColor}
                      </td>
                      <td className="px-4 font-mono">{c.condition}</td>
                      <td className="px-4 text-muted-foreground">
                        {c.description}
                      </td>
                      <td className="px-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteMutation.mutate({ id: c.id })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {colors?.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No colors defined.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <DataPagination
                currentPage={colorPagination.currentPage}
                pageSize={colorPagination.pageSize}
                totalCount={colorPagination.totalCount}
                onPageChange={colorPagination.setCurrentPage}
                onPageSizeChange={colorPagination.setPageSize}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
