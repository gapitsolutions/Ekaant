"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Calendar, CheckCircle2, Clock, Phone, Search } from "lucide-react";
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
  { value: "wrong_number", label: "Wrong Number", requiresNextCallDate: true },
  {
    value: "not_reachable",
    label: "Not Reachable / Switched Off",
    requiresNextCallDate: true,
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Follow-Up Calls</h1>
          <p className="text-muted-foreground">
            Track pending patients and record call outcomes.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {counts.pending}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Completed</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {counts.completed}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Successful</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {counts.successful}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{counts.all}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as TabValue)}
            >
              <TabsList>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="success">Successful</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex w-full gap-2 md:w-auto">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search file no / name / phone"
                  className="pl-9"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                />
              </div>
              <Button variant="outline" onClick={handleSearch}>
                Search
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading follow-ups...
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No follow-ups found.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border p-4 transition-colors hover:bg-muted/30"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.patient_name}</p>
                      <Badge variant="outline">{item.file_number}</Badge>
                      <Badge className="capitalize">{item.status}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {item.phone}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Follow-up: {formatDate(item.follow_up_date)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Last call: {formatDate(item.last_call_date)}
                      </span>
                    </div>
                    {item.last_call_note ? (
                      <p className="text-xs text-muted-foreground">
                        Note: {item.last_call_note}
                      </p>
                    ) : null}
                    {item.next_call_date ? (
                      <p className="text-xs text-amber-700">
                        Next call date: {formatDate(item.next_call_date)}
                      </p>
                    ) : null}
                  </div>
                  {item.status !== "successful" ? (
                    <Button onClick={() => openCallDialog(item)}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {item.status === "completed"
                        ? "Update Call"
                        : "Complete Call"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Follow-Up Call</DialogTitle>
            <DialogDescription>
              {selectedTicket?.patient_name} ({selectedTicket?.file_number})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Call Result</Label>
              <Select
                value={callResult}
                onValueChange={(value) =>
                  setCallResult(value as FollowUpCallResult)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select result" />
                </SelectTrigger>
                <SelectContent>
                  {RESULT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedResultConfig?.requiresNextCallDate ? (
              <div className="space-y-2">
                <Label>Next Call Date</Label>
                <Input
                  type="date"
                  value={nextCallDate}
                  onChange={(e) => setNextCallDate(e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Call Note</Label>
              <Textarea
                value={callNote}
                onChange={(e) => setCallNote(e.target.value)}
                placeholder="Write call summary"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCompleteCall} disabled={isSubmitting}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
