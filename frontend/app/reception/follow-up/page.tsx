"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import {
  completeReceptionFollowUpCall,
  getReceptionFollowUps,
  type FollowUpCallResult,
  type FollowUpItemResponse,
} from "@/lib/hms-api";
import { AlertCircle, Ban, Calendar, CheckCircle, CheckCircle2, Clock, MessageSquare, Phone, Search, User, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";

type TabValue = "pending" | "completed" | "success" | "all";

const RESULT_OPTIONS: Array<{
  value: FollowUpCallResult;
  label: string;
  requiresNextCallDate: boolean;
}> = [
  {
    value: "confirmed",
    label: "Confirmed (Will Come)",
    requiresNextCallDate: false,
  },
  {
    value: "busy_later",
    label: "Busy / Call Back Later",
    requiresNextCallDate: true,
  },
  // Wrong number is terminal — you can't call a wrong number on a future
  // date. It flags the patient (phone_number_invalid) server-side.
  { value: "wrong_number", label: "Wrong Number", requiresNextCallDate: false },
  {
    value: "not_reachable",
    label: "Not Reachable / Switched Off",
    requiresNextCallDate: true,
  },
  // Do not call is terminal — flags the patient (do_not_call) and excludes
  // them from future follow-up tickets.
  {
    value: "do_not_call",
    label: "Do Not Call",
    requiresNextCallDate: false,
  },
  { value: "other", label: "Other", requiresNextCallDate: true },
];

function asApiStage(
  tab: TabValue,
): "pending" | "completed" | "successful" | "all" {
  if (tab === "success") return "successful";
  return tab;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDaysOverdue(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const followUpDate = new Date(dateStr);
  followUpDate.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - followUpDate.getTime()) / (1000 * 60 * 60 * 24));
}

const RESULT_ICONS: Record<string, React.ReactNode> = {
  confirmed: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  busy_later: <Clock className="h-4 w-4 text-amber-500" />,
  wrong_number: <AlertCircle className="h-4 w-4 text-red-400" />,
  not_reachable: <XCircle className="h-4 w-4 text-slate-400" />,
  do_not_call: <Ban className="h-4 w-4 text-rose-500" />,
  other: <MessageSquare className="h-4 w-4 text-blue-400" />,
};

export default function FollowUpPage() {
  const { accessToken } = useAuth();
  const [tab, setTab] = useState<TabValue>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<FollowUpItemResponse[]>([]);
  const [counts, setCounts] = useState({
    pending: 0,
    completed: 0,
    successful: 0,
    all: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  const [selectedTicket, setSelectedTicket] =
    useState<FollowUpItemResponse | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [callResult, setCallResult] = useState<FollowUpCallResult | "">("");
  const [callNote, setCallNote] = useState("");
  const [nextCallDate, setNextCallDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedResultConfig = useMemo(
    () => RESULT_OPTIONS.find((option) => option.value === callResult),
    [callResult],
  );

  const loadData = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const response = await getReceptionFollowUps(accessToken, {
        stage: asApiStage(tab),
        q: searchQuery.trim() || undefined,
        page: 1,
        pageSize: 100,
      });
      setItems(response.items);
      setCounts(response.counts);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load follow-ups",
      );
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [accessToken, tab]);

  const handleSearch = () => {
    void loadData();
  };

  const openCallDialog = (ticket: FollowUpItemResponse) => {
    setSelectedTicket(ticket);
    setCallResult("");
    setCallNote("");
    setNextCallDate("");
    setDialogOpen(true);
  };

  const handleCompleteCall = async () => {
    if (!selectedTicket || !accessToken) return;
    if (!callResult) {
      toast.error("Please select call result.");
      return;
    }
    if (!callNote.trim()) {
      toast.error("Please add call note.");
      return;
    }
    if (selectedResultConfig?.requiresNextCallDate && !nextCallDate) {
      toast.error("Please select next call date for unsuccessful call.");
      return;
    }

    setIsSubmitting(true);
    try {
      await completeReceptionFollowUpCall(accessToken, selectedTicket.id, {
        call_result: callResult,
        call_note: callNote.trim(),
        next_call_date: selectedResultConfig?.requiresNextCallDate
          ? nextCallDate
          : null,
      });
      toast.success("Call outcome saved.");
      setDialogOpen(false);
      setSelectedTicket(null);
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save call outcome",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl 2xl:max-w-[1600px] mx-auto">
      <PageHeader
        title="Follow-Up Calling System"
        subtitle="Manage patient follow-ups scheduled by the pharmacy."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-[#e0f2f1] to-teal-50 border-teal-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-20">
            <Clock className="h-16 w-16 text-[#00695c]" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-[#00695c] flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Pending Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-[#004d40]">{counts.pending}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-blue-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Completed Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-800">{counts.completed}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Call Success (Confirmed)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-800">{counts.successful}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-2xl overflow-hidden">
        <CardHeader className="bg-white border-b border-slate-100 pb-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as TabValue)}
              className="w-full md:w-auto"
            >
              <TabsList className="bg-slate-100 p-1">
                <TabsTrigger value="pending" className="data-[state=active]:bg-[#00695c] data-[state=active]:text-white font-semibold shadow-sm px-4">
                  Pending Calls
                </TabsTrigger>
                <TabsTrigger value="completed" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 shadow-sm px-4">
                  Completed
                </TabsTrigger>
                <TabsTrigger value="success" className="data-[state=active]:bg-white data-[state=active]:text-emerald-600 shadow-sm px-4">
                  Success
                </TabsTrigger>
                <TabsTrigger value="all" className="data-[state=active]:bg-white data-[state=active]:text-slate-600 shadow-sm px-4">
                  All Records
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex w-full gap-2 md:w-auto">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, file no, phone..."
                  className="pl-9 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-emerald-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                />
              </div>
              <Button variant="outline" onClick={handleSearch} className="border-slate-200">
                Search
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <p className="text-sm text-slate-500">Loading follow-ups...</p>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              className="py-20"
              icon={
                <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                  <CheckCircle className="h-10 w-10 text-slate-300" />
                </div>
              }
              title={`No ${tab} follow-ups found`}
              description="There are no patients matching your criteria. Great job keeping the queue clear!"
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const daysOverdue = getDaysOverdue(item.follow_up_date);
                const isCritical = daysOverdue > 2;

                return (
                  <div key={item.id} className={`p-5 flex flex-col md:flex-row items-center justify-between transition-colors gap-4 ${isCritical ? 'bg-red-50/30 hover:bg-red-50/60' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${isCritical ? 'bg-red-100' : 'bg-slate-100'}`}>
                        <User className={`h-6 w-6 ${isCritical ? 'text-red-500' : 'text-slate-400'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-bold text-lg ${isCritical ? 'text-red-900' : 'text-slate-800'}`}>{item.patient_name}</h3>
                          <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-wider ${isCritical ? 'border-red-200 text-red-600 bg-white' : 'bg-slate-50'}`}>
                            {item.file_number}
                          </Badge>
                          <Badge className="capitalize text-[10px] font-bold uppercase tracking-wider">
                            {item.status}
                          </Badge>
                          {isCritical && (
                            <Badge className="bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider ml-1">
                              {daysOverdue} Days Overdue
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-slate-500">
                          <span className="flex items-center gap-1">
                            <Phone className={`h-3.5 w-3.5 ${isCritical ? 'text-red-400' : 'text-slate-400'}`} />
                            {item.phone}
                          </span>
                          <span className={`flex items-center gap-1 ${isCritical ? 'text-red-600 font-semibold' : 'text-sky-600'}`}>
                            <Calendar className="h-3.5 w-3.5" />
                            Follow-up: {formatDate(item.follow_up_date)}
                          </span>
                          {item.last_call_date && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              Last call: {formatDate(item.last_call_date)}
                            </span>
                          )}
                          {item.last_call_note && (
                            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-emerald-100">
                              <CheckCircle2 className="h-3 w-3" />
                              {item.last_call_note}
                            </span>
                          )}
                          {item.next_call_date && (
                            <span className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-amber-100">
                              <Clock className="h-3 w-3" />
                              Next: {formatDate(item.next_call_date)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {item.status !== "successful" && (
                      <div className="w-full md:w-auto">
                        <Button
                          onClick={() => openCallDialog(item)}
                          className={`w-full md:w-auto shadow-none border ${
                            item.status === "completed"
                              ? "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border-emerald-200 font-bold px-8"
                          }`}
                        >
                          {item.status === "completed" ? (
                            <RotateCcw className="h-4 w-4 mr-2" />
                          ) : (
                            <Phone className="h-4 w-4 mr-2" />
                          )}
                          {item.status === "completed" ? "Redial / Update" : "Call Patient"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Phone className="h-5 w-5 text-emerald-600" />
              Call Result: {selectedTicket?.patient_name}
            </DialogTitle>
            <DialogDescription>
              {selectedTicket?.file_number} — Record the outcome of your conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Response Status</Label>
              <Select
                value={callResult}
                onValueChange={(value) =>
                  setCallResult(value as FollowUpCallResult)
                }
              >
                <SelectTrigger className="bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  {RESULT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        {RESULT_ICONS[option.value]}
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedResultConfig?.requiresNextCallDate ? (
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Schedule Next Call</Label>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 h-11">
                  <Calendar className="h-4 w-4 text-emerald-600" />
                  <Input
                    type="date"
                    value={nextCallDate}
                    onChange={(e) => setNextCallDate(e.target.value)}
                    className="border-none bg-transparent shadow-none focus-visible:ring-0 p-0 h-full text-sm font-medium"
                  />
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Call Note</Label>
              <Textarea
                value={callNote}
                onChange={(e) => setCallNote(e.target.value)}
                placeholder="Add any specific details about the call..."
                className="bg-slate-50 border-slate-200 min-h-[80px]"
              />
            </div>
          </div>
          {selectedTicket?.last_call_note && (
            <div className="mx-1 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 mb-4">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <RotateCcw className="h-3 w-3" />
                Previous Call Note
              </p>
              <p className="text-xs text-slate-600 bg-white/50 p-2 rounded border border-emerald-100/50 italic">
                &ldquo;{selectedTicket.last_call_note}&rdquo;
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSubmitting}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCompleteCall}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-8"
            >
              Save Response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
