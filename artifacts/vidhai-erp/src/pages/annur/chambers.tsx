import { useState } from "react";
import { 
  useListChambers, useListLocations, useCreateChamberReading, useGetChamberReadings, 
  useCreateChamber, useUpdateChamber, useDeleteChamber,
  getListChambersQueryKey
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Activity, Thermometer, Wind, Settings, Trash2, Edit2, CheckCircle2, Box, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function Chambers() {
  const queryClient = useQueryClient();
  const { data: locations } = useListLocations();
  const annurLoc = locations?.find(l => l.code === 'A' || l.name.toLowerCase().includes('annur'));
  
  const { data: chambers, isLoading } = useListChambers({ 
    locationId: annurLoc?.id || undefined 
  }, { 
    query: { enabled: !!annurLoc } 
  } as any);

  const [selectedChamberId, setSelectedChamberId] = useState<number | null>(null);
  const [isReadingModalOpen, setIsReadingModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
  // Create / Edit modal
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [manageMode, setManageMode] = useState<'create' | 'edit'>('create');
  const [chamberForm, setChamberForm] = useState<any>({ name: "", chamberType: "bulk", capacity: "", lengthM: "", widthM: "", heightM: "", notes: "" });

  const { data: history } = useGetChamberReadings(selectedChamberId!, {
    query: { enabled: !!selectedChamberId && isDetailModalOpen }
  } as any);

  const createMutation = useCreateChamber({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChambersQueryKey() });
        setIsManageModalOpen(false);
        toast.success("Chamber created");
      }
    }
  });

  const updateMutation = useUpdateChamber({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChambersQueryKey() });
        setIsManageModalOpen(false);
        setIsDetailModalOpen(false);
        toast.success("Chamber updated");
      }
    }
  });

  const deleteMutation = useDeleteChamber({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChambersQueryKey() });
        setIsDetailModalOpen(false);
        toast.success("Chamber deleted");
      }
    }
  });

  const createReadingMutation = useCreateChamberReading({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChambersQueryKey() });
        setIsReadingModalOpen(false);
        toast.success("Reading logged");
      }
    }
  });

  const [readingForm, setReadingForm] = useState({ temperatureCelsius: "", nh3Ppm: "", co2Percent: "", humidity: "", notes: "" });

  const handleOpenReading = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setSelectedChamberId(id);
    setReadingForm({ temperatureCelsius: "", nh3Ppm: "", co2Percent: "", humidity: "", notes: "" });
    setIsReadingModalOpen(true);
  };

  const handleOpenDetail = (id: number) => {
    setSelectedChamberId(id);
    setIsDetailModalOpen(true);
  };

  const handleOpenCreate = () => {
    setManageMode('create');
    setChamberForm({ name: "", chamberType: "bulk", capacity: "", lengthM: "", widthM: "", heightM: "", notes: "" });
    setIsManageModalOpen(true);
  };

  const handleOpenEdit = (chamber: any) => {
    setManageMode('edit');
    setChamberForm({
      name: chamber.name,
      chamberType: chamber.chamberType,
      capacity: chamber.capacity || "",
      lengthM: chamber.lengthM || "",
      widthM: chamber.widthM || "",
      heightM: chamber.heightM || "",
      notes: chamber.notes || ""
    });
    setSelectedChamberId(chamber.id);
    setIsManageModalOpen(true);
  };

  const handleManageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!annurLoc) return;
    
    const payload = {
      name: chamberForm.name,
      chamberType: chamberForm.chamberType,
      capacity: chamberForm.capacity ? Number(chamberForm.capacity) : null,
      lengthM: chamberForm.lengthM ? Number(chamberForm.lengthM) : null,
      widthM: chamberForm.widthM ? Number(chamberForm.widthM) : null,
      heightM: chamberForm.heightM ? Number(chamberForm.heightM) : null,
      notes: chamberForm.notes || null
    };

    if (manageMode === 'create') {
      createMutation.mutate({ data: { ...payload, locationId: annurLoc.id } as any });
    } else {
      updateMutation.mutate({ id: selectedChamberId!, data: payload as any });
    }
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this chamber? This cannot be undone.")) {
      deleteMutation.mutate({ id: selectedChamberId! });
    }
  };

  const handleAddReading = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChamberId) return;
    
    createReadingMutation.mutate({
      id: selectedChamberId,
      data: {
        temperatureCelsius: readingForm.temperatureCelsius ? Number(readingForm.temperatureCelsius) : null,
        nh3Ppm: readingForm.nh3Ppm ? Number(readingForm.nh3Ppm) : null,
        co2Percent: readingForm.co2Percent ? Number(readingForm.co2Percent) : null,
        humidity: readingForm.humidity ? Number(readingForm.humidity) : null,
        notes: readingForm.notes || null
      }
    });
  };

  const selectedChamber = chambers?.find(c => c.id === selectedChamberId);

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-display">Chamber Control</h1>
            
          </div>
          <Button onClick={handleOpenCreate} className="rounded-sm shadow-sm h-10 px-4">
            <Plus className="w-4 h-4 mr-2" />
            New Chamber
          </Button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading chamber data...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {chambers?.map((c) => {
              const isPreWetting = c.chamberType === 'pre_wetting';
              const isTurn = c.chamberType === 'turn';
              const isBulk = c.chamberType === 'bulk';

              return (
                <Card 
                  key={c.id} 
                  className={`relative overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 border ${
                    c.status === 'active' ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border'
                  }`}
                  onClick={() => handleOpenDetail(c.id)}
                >
                  {/* Top color bar indicator */}
                  <div className={`h-1 w-full ${isPreWetting ? 'bg-amber-400' : isTurn ? 'bg-blue-400' : 'bg-primary'}`}></div>
                  
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="text-xl font-display font-bold tracking-tight">{c.name}</div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground mt-0.5 flex items-center gap-1">
                          {isPreWetting && <Wind className="w-3 h-3" />}
                          {isTurn && <Activity className="w-3 h-3" />}
                          {isBulk && <Thermometer className="w-3 h-3" />}
                          {c.chamberType.replace('_', ' ')}
                        </div>
                      </div>
                      <Badge variant="outline" className={`border-0 rounded-sm uppercase tracking-wider text-[10px] shadow-sm ${
                        c.status === 'active' ? 'bg-primary text-primary-foreground' : 
                        c.status === 'maintenance' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        {c.status}
                      </Badge>
                    </div>

                    <div className="h-16 flex flex-col justify-center">
                      {c.status === 'active' && c.currentBatchCode ? (
                        <div className="flex items-center gap-2">
                          <Box className="w-4 h-4 text-muted-foreground" />
                          <span className="font-mono text-lg font-semibold">{c.currentBatchCode}</span>
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
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Outdoor Zone</div>
                      ) : isTurn ? (
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Turning Process</div>
                      ) : (
                        <div className="flex gap-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Temp</span>
                            <span className="font-mono font-medium">{c.lastTemperature ?? '--'}°C</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">NH3</span>
                            <span className="font-mono font-medium">{c.lastNh3 ?? '--'}ppm</span>
                          </div>
                        </div>
                      )}
                      
                      {(!isPreWetting && !isTurn) && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10 rounded-sm"
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
          <DialogContent className="rounded-sm border-border shadow-lg max-w-md">
            <DialogHeader>
              <DialogTitle>{manageMode === 'create' ? 'Create Chamber' : 'Edit Chamber'}</DialogTitle>
              <DialogDescription>Configure structural and functional parameters.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleManageSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
                <Input required value={chamberForm.name} onChange={e => setChamberForm({ ...chamberForm, name: e.target.value })} className="rounded-sm font-medium" placeholder="e.g. Bulk Room 1" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
                  <Select value={chamberForm.chamberType} onValueChange={(v) => setChamberForm({ ...chamberForm, chamberType: v })}>
                    <SelectTrigger className="h-9 text-sm rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pre_wetting">Pre-Wetting</SelectItem>
                      <SelectItem value="turn">Turn</SelectItem>
                      <SelectItem value="bulk">Bulk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Capacity (Bags)</Label>
                  <Input type="number" value={chamberForm.capacity} onChange={e => setChamberForm({ ...chamberForm, capacity: e.target.value })} className="rounded-sm font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Length (m)</Label>
                  <Input type="number" step="0.1" value={chamberForm.lengthM} onChange={e => setChamberForm({ ...chamberForm, lengthM: e.target.value })} className="rounded-sm font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Width (m)</Label>
                  <Input type="number" step="0.1" value={chamberForm.widthM} onChange={e => setChamberForm({ ...chamberForm, widthM: e.target.value })} className="rounded-sm font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Height (m)</Label>
                  <Input type="number" step="0.1" value={chamberForm.heightM} onChange={e => setChamberForm({ ...chamberForm, heightM: e.target.value })} className="rounded-sm font-mono" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Input value={chamberForm.notes} onChange={e => setChamberForm({ ...chamberForm, notes: e.target.value })} className="rounded-sm" />
              </div>
              <div className="pt-4 border-t flex justify-end gap-2">
                <DialogClose asChild><Button variant="outline" type="button" className="rounded-sm">Cancel</Button></DialogClose>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="rounded-sm px-6">
                  {manageMode === 'create' ? 'Create' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Detail / History Modal */}
        <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
          <DialogContent className="rounded-sm border-border shadow-xl max-w-3xl overflow-hidden p-0 gap-0 bg-background flex flex-col max-h-[85vh]">
            <div className="bg-muted/30 border-b p-6 flex items-start justify-between">
              <div>
                <DialogTitle className="text-2xl font-display tracking-tight flex items-center gap-3">
                  {selectedChamber?.name}
                  <Badge variant="outline" className="border bg-white shadow-sm uppercase tracking-wider text-xs">
                    {selectedChamber?.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="mt-1 flex gap-4 text-xs font-mono uppercase tracking-wider">
                  <span>Type: {selectedChamber?.chamberType.replace('_', ' ')}</span>
                  {selectedChamber?.capacity && <span>Cap: {selectedChamber.capacity} bags</span>}
                  {selectedChamber?.lengthM && <span>Dim: {selectedChamber.lengthM}x{selectedChamber.widthM}x{selectedChamber.heightM}m</span>}
                </DialogDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setIsDetailModalOpen(false); handleOpenEdit(selectedChamber); }} className="h-8 rounded-sm">
                  <Edit2 className="w-3 h-3 mr-2" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={handleDelete} className="h-8 rounded-sm text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3 mr-2" /> Delete
                </Button>
              </div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-8">
              {selectedChamber?.status === 'active' && (
                <div className="bg-primary/5 border border-primary/20 rounded p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary text-primary-foreground p-2 rounded">
                      <Box className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wider font-semibold text-primary">Current Batch</div>
                      <div className="font-mono text-lg font-bold">{selectedChamber.currentBatchCode}</div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-sm border-primary/20 text-primary">View Batch</Button>
                </div>
              )}

              {selectedChamber?.chamberType === 'bulk' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Thermometer className="w-4 h-4" /> Environmental Log
                    </h3>
                    <Button size="sm" onClick={(e) => handleOpenReading(e, selectedChamber.id)} className="h-8 rounded-sm text-xs px-3">
                      <Plus className="w-3 h-3 mr-1" /> Log Reading
                    </Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                        <tr>
                          <th className="px-4 py-2 font-medium">Time</th>
                          <th className="px-4 py-2 font-medium text-right">Temp °C</th>
                          <th className="px-4 py-2 font-medium text-right">NH3 ppm</th>
                          <th className="px-4 py-2 font-medium text-right">CO2 %</th>
                          <th className="px-4 py-2 font-medium">Logged By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {history?.map((r) => (
                          <tr key={r.id} className="h-[36px] hover:bg-muted/30">
                            <td className="px-4 font-mono text-xs">{new Date(r.recordedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                            <td className="px-4 font-mono text-right">{r.temperatureCelsius ?? '-'}</td>
                            <td className="px-4 font-mono text-right">{r.nh3Ppm ?? '-'}</td>
                            <td className="px-4 font-mono text-right">{r.co2Percent ?? '-'}</td>
                            <td className="px-4 text-xs text-muted-foreground">{r.recordedByName}</td>
                          </tr>
                        ))}
                        {(!history || history.length === 0) && (
                          <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No environmental readings found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedChamber?.chamberType !== 'bulk' && (
                <div className="py-8 text-center text-muted-foreground border border-dashed rounded flex items-center justify-center gap-2">
                  <Info className="w-4 h-4" /> This chamber type does not require hourly environmental monitoring.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Reading Modal */}
        <Dialog open={isReadingModalOpen} onOpenChange={setIsReadingModalOpen}>
          <DialogContent className="rounded-sm border-border shadow-xl max-w-sm">
            <DialogHeader>
              <DialogTitle>Log Environment Reading</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddReading} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Chamber</Label>
                <div className="px-3 py-2 bg-muted rounded-sm text-sm border font-medium font-mono">
                  {selectedChamber?.name}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Temperature (°C)</Label>
                  <Input type="number" step="0.1" value={readingForm.temperatureCelsius} onChange={e => setReadingForm({ ...readingForm, temperatureCelsius: e.target.value })} className="rounded-sm font-mono h-10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">NH3 (ppm)</Label>
                  <Input type="number" step="0.01" value={readingForm.nh3Ppm} onChange={e => setReadingForm({ ...readingForm, nh3Ppm: e.target.value })} className="rounded-sm font-mono h-10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">CO2 (%)</Label>
                  <Input type="number" step="0.01" value={readingForm.co2Percent} onChange={e => setReadingForm({ ...readingForm, co2Percent: e.target.value })} className="rounded-sm font-mono h-10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Humidity (%)</Label>
                  <Input type="number" step="0.1" value={readingForm.humidity} onChange={e => setReadingForm({ ...readingForm, humidity: e.target.value })} className="rounded-sm font-mono h-10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Input value={readingForm.notes} onChange={e => setReadingForm({ ...readingForm, notes: e.target.value })} className="rounded-sm h-10" placeholder="Optional conditions..." />
              </div>
              <div className="pt-4 border-t">
                <Button type="submit" disabled={createReadingMutation.isPending} className="w-full rounded-sm h-10">Submit Log</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    </Shell>
  );
}
