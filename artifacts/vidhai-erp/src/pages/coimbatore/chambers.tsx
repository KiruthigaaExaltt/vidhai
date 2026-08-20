import { useEffect, useState } from "react";
import {
  useListChambers,
  useListLocations,
  useCreateChamberReading,
  useGetChamberReadings,
  useCreateChamber,
  useUpdateChamber,
  useDeleteChamber,
  getListChambersQueryKey,
  getGetChamberReadingsQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Activity,
  Thermometer,
  Wind,
  Settings,
  Trash2,
  Edit2,
  CheckCircle2,
  Box,
  Info,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function CoimbatoreChambers() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: locations } = useListLocations();
  const coimbatoreLoc = locations?.find(
    (l) => l.code === "C" || l.name.toLowerCase().includes("coimbatore"),
  );

  const { data: chambers, isLoading } = useListChambers(
    {
      locationId: coimbatoreLoc?.id || undefined,
    },
    {
      query: { enabled: !!coimbatoreLoc },
    } as any,
  );

  const [selectedChamberId, setSelectedChamberId] = useState<number | null>(
    null,
  );
  const [isReadingModalOpen, setIsReadingModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    const chamberId = Number(
      new URLSearchParams(window.location.search).get("reading"),
    );
    if (
      !chamberId ||
      !(chambers ?? []).some((chamber: any) => chamber.id === chamberId)
    )
      return;
    setSelectedChamberId(chamberId);
    setReadingForm({
      temperatureCelsius: "",
      nh3Ppm: "",
      co2Percent: "",
      humidity: "",
      notes: "",
    });
    setIsReadingModalOpen(true);
    window.history.replaceState({}, "", window.location.pathname);
  }, [chambers]);

  // Create / Edit modal
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [manageMode, setManageMode] = useState<"create" | "edit">("create");
  const [chamberForm, setChamberForm] = useState<any>({
    name: "",
    chamberType: "casing_soil",
    capacity: "",
    lengthM: "",
    widthM: "",
    heightM: "",
    notes: "",
  });

  const { data: history } = useGetChamberReadings(selectedChamberId!, {
    query: { enabled: !!selectedChamberId && isDetailModalOpen },
  } as any);

  const createMutation = useCreateChamber({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChambersQueryKey() });
        setIsManageModalOpen(false);
        toast.success("Chamber created");
      },
    },
  });

  const updateMutation = useUpdateChamber({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChambersQueryKey() });
        setIsManageModalOpen(false);
        setIsDetailModalOpen(false);
        toast.success("Chamber updated");
      },
    },
  });

  const deleteMutation = useDeleteChamber({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChambersQueryKey() });
        setIsDetailModalOpen(false);
        toast.success("Chamber deleted");
      },
    },
  });

  const createReadingMutation = useCreateChamberReading({
    mutation: {
      onSuccess: (reading, variables) => {
        queryClient.setQueryData(
          getGetChamberReadingsQueryKey(variables.id),
          (existing: typeof history) => [reading, ...(existing ?? [])],
        );
        queryClient.invalidateQueries({
          queryKey: getGetChamberReadingsQueryKey(variables.id),
        });
        queryClient.invalidateQueries({ queryKey: getListChambersQueryKey() });
        setIsReadingModalOpen(false);
        setIsDetailModalOpen(true);
        toast.success("Reading logged");
      },
    },
  });

  const [readingForm, setReadingForm] = useState({
    temperatureCelsius: "",
    nh3Ppm: "",
    co2Percent: "",
    humidity: "",
    notes: "",
  });

  const handleOpenReading = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setSelectedChamberId(id);
    setReadingForm({
      temperatureCelsius: "",
      nh3Ppm: "",
      co2Percent: "",
      humidity: "",
      notes: "",
    });
    setIsReadingModalOpen(true);
  };

  const handleOpenDetail = (id: number) => {
    setSelectedChamberId(id);
    setIsDetailModalOpen(true);
  };

  const handleOpenCreate = () => {
    setManageMode("create");
    setChamberForm({
      name: "",
      chamberType: "casing_soil",
      capacity: "",
      lengthM: "",
      widthM: "",
      heightM: "",
      notes: "",
    });
    setIsManageModalOpen(true);
  };

  const handleOpenEdit = (chamber: any) => {
    setManageMode("edit");
    setChamberForm({
      name: chamber.name,
      chamberType: chamber.chamberType,
      capacity: chamber.capacity || "",
      lengthM: chamber.lengthM || "",
      widthM: chamber.widthM || "",
      heightM: chamber.heightM || "",
      notes: chamber.notes || "",
    });
    setSelectedChamberId(chamber.id);
    setIsManageModalOpen(true);
  };

  const handleManageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coimbatoreLoc) return;

    const payload = {
      name: chamberForm.name,
      chamberType: chamberForm.chamberType,
      capacity: chamberForm.capacity ? Number(chamberForm.capacity) : null,
      lengthM: chamberForm.lengthM ? Number(chamberForm.lengthM) : null,
      widthM: chamberForm.widthM ? Number(chamberForm.widthM) : null,
      heightM: chamberForm.heightM ? Number(chamberForm.heightM) : null,
      notes: chamberForm.notes || null,
    };

    if (manageMode === "create") {
      createMutation.mutate({
        data: { ...payload, locationId: coimbatoreLoc.id } as any,
      });
    } else {
      updateMutation.mutate({ id: selectedChamberId!, data: payload as any });
    }
  };

  const handleDelete = () => {
    if (
      confirm(
        "Are you sure you want to delete this chamber? This cannot be undone.",
      )
    ) {
      deleteMutation.mutate({ id: selectedChamberId! });
    }
  };

  const handleAddReading = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChamberId) return;

    createReadingMutation.mutate({
      id: selectedChamberId,
      data: {
        temperatureCelsius: readingForm.temperatureCelsius
          ? Number(readingForm.temperatureCelsius)
          : null,
        nh3Ppm: readingForm.nh3Ppm ? Number(readingForm.nh3Ppm) : null,
        co2Percent: readingForm.co2Percent
          ? Number(readingForm.co2Percent)
          : null,
        humidity: readingForm.humidity ? Number(readingForm.humidity) : null,
        notes: readingForm.notes || null,
      },
    });
  };

  const selectedChamber = chambers?.find((c) => c.id === selectedChamberId);

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-display">
              Casing Soil Chambers
            </h1>
          </div>
          <Button
            onClick={handleOpenCreate}
            className="rounded-md shadow-sm h-10 px-4"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Casing Soil Chamber
          </Button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Loading chamber data...
          </div>
        ) : chambers?.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No chambers yet. Create the first one.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {chambers?.map((c) => {
              const isPreWetting = c.chamberType === "pre_wetting";
              const isTurn = c.chamberType === "turn";
              const isBunker = c.chamberType.startsWith("bunker_");
              const isBulk = c.chamberType === "bulk";

              return (
                <Card
                  key={c.id}
                  className={`relative overflow-hidden cursor-pointer transition-all rounded-md shadow-md hover:shadow-lg hover:-translate-y-0.5 border ${
                    c.status === "active"
                      ? "border-primary/50 ring-1 ring-primary/20"
                      : "border-border"
                  }`}
                  onClick={() => handleOpenDetail(c.id)}
                >
                  {/* Top color bar indicator */}
                  <div
                    className={`h-1 w-full ${isPreWetting ? "bg-amber-400" : isTurn || isBunker ? "bg-blue-400" : "bg-primary"}`}
                  ></div>

                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="text-xl font-display font-bold tracking-tight">
                          {c.name}
                        </div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground mt-0.5 flex items-center gap-1">
                          {isPreWetting && <Wind className="w-3 h-3" />}
                          {(isTurn || isBunker) && (
                            <Activity className="w-3 h-3" />
                          )}
                          {isBulk && <Thermometer className="w-3 h-3" />}
                          {c.chamberType === "turn"
                            ? "Turn � Legacy"
                            : c.chamberType.replaceAll("_", " ")}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`border-0 rounded-md uppercase tracking-wider text-[10px] shadow-sm ${
                          c.status === "active"
                            ? "bg-primary text-primary-foreground"
                            : c.status === "maintenance"
                              ? "bg-destructive text-destructive-foreground"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {c.status}
                      </Badge>
                    </div>

                    <div className="h-16 flex flex-col justify-center">
                      {c.status === "active" && c.currentBatchCode ? (
                        <div className="flex items-center gap-2">
                          <Box className="w-4 h-4 text-muted-foreground" />
                          <span className="font-mono text-lg font-semibold">
                            {c.currentBatchCode}
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" /> Available / Idle
                        </div>
                      )}
                    </div>

                    {/* Footer Stats depending on type */}
                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                      {isPreWetting ? (
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">
                          Outdoor Zone
                        </div>
                      ) : isTurn || isBunker ? (
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">
                          Turning Process
                        </div>
                      ) : (
                        <div className="flex gap-3 flex-wrap">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Temp
                            </span>
                            <span className="font-mono font-medium">
                              {c.lastTemperature ?? "--"}°C
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              NH3
                            </span>
                            <span className="font-mono font-medium">
                              {c.lastNh3 ?? "--"}ppm
                            </span>
                          </div>{" "}
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              CO2
                            </span>
                            <span className="font-mono font-medium">
                              {(c as any).lastCo2 ?? "--"}%
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Moist.
                            </span>
                            <span className="font-mono font-medium">
                              {(c as any).lastMoisture ?? "--"}%
                            </span>
                          </div>
                        </div>
                      )}

                      {c.status === "active" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10 rounded-md"
                          onClick={(e) => handleOpenReading(e, c.id)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create/Edit Modal */}
        <Dialog open={isManageModalOpen} onOpenChange={setIsManageModalOpen}>
          <DialogContent className="rounded-md border-border shadow-lg max-w-md">
            <DialogHeader>
              <DialogTitle>
                {manageMode === "create" ? "Create Chamber" : "Edit Chamber"}
              </DialogTitle>
              <DialogDescription>
                Configure structural and functional parameters.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleManageSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Name
                </Label>
                <Input
                  required
                  value={chamberForm.name}
                  onChange={(e) =>
                    setChamberForm({ ...chamberForm, name: e.target.value })
                  }
                  className="rounded-md font-medium"
                  placeholder="e.g. A1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Type
                  </Label>
                  <Input
                    value="Casing Soil Chamber"
                    disabled
                    className="h-9 text-sm rounded-md bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Capacity
                  </Label>
                  <Input
                    type="number"
                    value={chamberForm.capacity}
                    onChange={(e) =>
                      setChamberForm({
                        ...chamberForm,
                        capacity: e.target.value,
                      })
                    }
                    className="rounded-md font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Length (m)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={chamberForm.lengthM}
                    onChange={(e) =>
                      setChamberForm({
                        ...chamberForm,
                        lengthM: e.target.value,
                      })
                    }
                    className="rounded-md font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Width (m)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={chamberForm.widthM}
                    onChange={(e) =>
                      setChamberForm({ ...chamberForm, widthM: e.target.value })
                    }
                    className="rounded-md font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Height (m)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={chamberForm.heightM}
                    onChange={(e) =>
                      setChamberForm({
                        ...chamberForm,
                        heightM: e.target.value,
                      })
                    }
                    className="rounded-md font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </Label>
                <Input
                  value={chamberForm.notes}
                  onChange={(e) =>
                    setChamberForm({ ...chamberForm, notes: e.target.value })
                  }
                  className="rounded-md"
                />
              </div>
              <div className="pt-4 border-t flex justify-end gap-2">
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    type="button"
                    className="rounded-md"
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                  className="rounded-md px-6"
                >
                  {manageMode === "create" ? "Create" : "Save Changes"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Detail / History Modal */}
        <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
          <DialogContent className="rounded-md border-border shadow-xl max-w-3xl overflow-hidden p-0 gap-0 bg-background flex flex-col max-h-[85vh]">
            <div className="bg-muted/30 border-b p-6 flex items-start justify-between">
              <div>
                <DialogTitle className="text-2xl font-display tracking-tight flex items-center gap-3">
                  {selectedChamber?.name}
                  <Badge
                    variant="outline"
                    className="border bg-white shadow-sm uppercase tracking-wider text-xs"
                  >
                    {selectedChamber?.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="mt-1 flex gap-4 text-xs font-mono uppercase tracking-wider">
                  <span>
                    Type: {selectedChamber?.chamberType.replace("_", " ")}
                  </span>
                  {selectedChamber?.capacity && (
                    <span>Cap: {selectedChamber.capacity} bags</span>
                  )}
                  {selectedChamber?.lengthM && (
                    <span>
                      Dim: {selectedChamber.lengthM}x{selectedChamber.widthM}x
                      {selectedChamber.heightM}m
                    </span>
                  )}
                </DialogDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    handleOpenEdit(selectedChamber);
                  }}
                  className="h-8 rounded-md"
                >
                  <Edit2 className="w-3 h-3 mr-2" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  className="h-8 rounded-md text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3 mr-2" /> Delete
                </Button>
              </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-8">
              {selectedChamber?.status === "active" && (
                <div className="bg-primary/5 border border-primary/20 rounded-md p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary text-primary-foreground p-2 rounded-md">
                      <Box className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wider font-semibold text-primary">
                        Current Batch
                      </div>
                      <div className="font-mono text-lg font-bold">
                        {selectedChamber.currentBatchCode}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-md border-primary/20 text-primary"
                    disabled={!selectedChamber.currentBatchId}
                    onClick={() => {
                      if (selectedChamber.currentBatchId) {
                        setLocation(
                          `/coimbatore/batches/${selectedChamber.currentBatchId}`,
                        );
                      }
                    }}
                  >
                    View Batch
                  </Button>
                </div>
              )}

              {selectedChamber &&
                String(selectedChamber.chamberType) === "casing_soil" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Thermometer className="w-4 h-4" /> Environmental Log
                      </h3>
                      <Button
                        size="sm"
                        onClick={(e) =>
                          handleOpenReading(e, selectedChamber.id)
                        }
                        className="h-8 rounded-md text-xs px-3"
                      >
                        <Plus className="w-3 h-3 mr-1" /> Log Reading
                      </Button>
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                          <tr>
                            <th className="px-4 py-2 font-medium">Time</th>
                            <th className="px-4 py-2 font-medium">Batch</th>
                            <th className="px-4 py-2 font-medium">Turn</th>
                            <th className="px-4 py-2 font-medium text-right">
                              Temp °C
                            </th>
                            <th className="px-4 py-2 font-medium text-right">
                              NH3 ppm
                            </th>
                            <th className="px-4 py-2 font-medium text-right">
                              CO2 %
                            </th>
                            <th className="px-4 py-2 font-medium text-right">
                              Moisture %
                            </th>
                            <th className="px-4 py-2 font-medium">Logged By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {history?.map((r) => (
                            <tr
                              key={r.id}
                              className="h-[36px] hover:bg-muted/30"
                            >
                              <td className="px-4 font-mono text-xs">
                                {new Date(r.recordedAt).toLocaleString([], {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </td>
                              <td className="px-4 font-mono text-xs">
                                {(r as any).batchCode ?? "�"}
                              </td>
                              <td className="px-4 font-mono text-xs">
                                {(r as any).turnNumber
                                  ? `T${(r as any).turnNumber}`
                                  : "�"}
                              </td>
                              <td className="px-4 font-mono text-right">
                                {r.temperatureCelsius ?? "-"}
                              </td>
                              <td className="px-4 font-mono text-right">
                                {r.nh3Ppm ?? "-"}
                              </td>
                              <td className="px-4 font-mono text-right">
                                {r.co2Percent ?? "-"}
                              </td>
                              <td className="px-4 font-mono text-right">
                                {r.humidity ?? "-"}
                              </td>
                              <td className="px-4 text-xs text-muted-foreground">
                                {r.recordedByName}
                              </td>
                            </tr>
                          ))}
                          {(!history || history.length === 0) && (
                            <tr>
                              <td
                                colSpan={8}
                                className="px-4 py-8 text-center text-muted-foreground"
                              >
                                No environmental readings found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Reading Modal */}
        <Dialog open={isReadingModalOpen} onOpenChange={setIsReadingModalOpen}>
          <DialogContent className="rounded-md border-border shadow-xl max-w-sm">
            <DialogHeader>
              <DialogTitle>Log Environment Reading</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddReading} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Chamber
                </Label>
                <div className="px-3 py-2 bg-muted rounded-md text-sm border font-medium font-mono">
                  {selectedChamber?.name}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Temperature (°C)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={readingForm.temperatureCelsius}
                    onChange={(e) =>
                      setReadingForm({
                        ...readingForm,
                        temperatureCelsius: e.target.value,
                      })
                    }
                    className="rounded-md font-mono h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    NH3 (ppm)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={readingForm.nh3Ppm}
                    onChange={(e) =>
                      setReadingForm({ ...readingForm, nh3Ppm: e.target.value })
                    }
                    className="rounded-md font-mono h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    CO2 (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={readingForm.co2Percent}
                    onChange={(e) =>
                      setReadingForm({
                        ...readingForm,
                        co2Percent: e.target.value,
                      })
                    }
                    className="rounded-md font-mono h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Moisture (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={readingForm.humidity}
                    onChange={(e) =>
                      setReadingForm({
                        ...readingForm,
                        humidity: e.target.value,
                      })
                    }
                    className="rounded-md font-mono h-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </Label>
                <Input
                  value={readingForm.notes}
                  onChange={(e) =>
                    setReadingForm({ ...readingForm, notes: e.target.value })
                  }
                  className="rounded-md h-10"
                  placeholder="Optional conditions..."
                />
              </div>
              <div className="pt-4 border-t">
                <Button
                  type="submit"
                  disabled={
                    createReadingMutation.isPending ||
                    selectedChamber?.status !== "active"
                  }
                  className="w-full rounded-md h-10"
                >
                  Submit Log
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
