"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Loader2, RefreshCw, Users } from "lucide-react";
import {
  getPharmacyQueue,
  type PharmacyQueueItem,
} from "@/lib/pharmacy-api";
import { navigate } from "@/lib/navigation";

export default function PrescriptionQueuePage() {
  const [items, setItems] = useState<PharmacyQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadQueue = useCallback(() => {
    setIsLoading(true);
    setErrorMessage("");
    return getPharmacyQueue()
      .then((data) => setItems(data.items || []))
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load pharmacy queue.",
        );
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadQueue();
    const refreshTimer = window.setInterval(loadQueue, 10000);
    const onFocus = () => loadQueue();
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadQueue]);

  const formatTime = (value?: string | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const calculateAge = (dob?: string | null) => {
    if (!dob) return "-";
    const today = new Date();
    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) return "-";
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return `${age}y`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/pharmacy")}
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Prescription Queue
            </h1>
            <p className="text-muted-foreground">
              Patients currently waiting at the pharmacy stage
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-base px-3 py-1">
            {items.length} in queue
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadQueue()}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patient Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {errorMessage ? (
            <p className="text-sm text-destructive mb-3">{errorMessage}</p>
          ) : null}

          {isLoading && items.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">
                No patients in the queue
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Checked-in patients pending dispense will appear here
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>File No.</TableHead>
                    <TableHead>Age / Sex</TableHead>
                    <TableHead>Check-in Time</TableHead>
                    <TableHead>Checked In By</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const initials = item.patient_name
                      ? item.patient_name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()
                      : "?";
                    const outstanding = Number(item.outstanding_debt) || 0;
                    return (
                      <TableRow key={item.session_id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-semibold text-primary">
                                {initials}
                              </span>
                            </div>
                            <div>
                              <div>{item.patient_name}</div>
                              {item.patient?.phone ? (
                                <div className="text-xs text-muted-foreground">
                                  {item.patient.phone}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {item.patient?.file_number || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {calculateAge(item.patient?.date_of_birth)}{" "}
                          {item.patient?.sex === "male"
                            ? "/ M"
                            : item.patient?.sex === "female"
                              ? "/ F"
                              : ""}
                        </TableCell>
                        <TableCell>{formatTime(item.checked_in_at)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.checked_in_by_name || "—"}
                        </TableCell>
                        <TableCell>
                          {outstanding > 0 ? (
                            <Badge
                              variant="outline"
                              className="border-rose-500 text-rose-700 bg-rose-50"
                            >
                              ₹{outstanding.toLocaleString("en-IN")}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              ₹0
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 capitalize">
                            {item.current_stage}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() =>
                              navigate(`/pharmacy/dispense/${item.session_id}`)
                            }
                          >
                            Dispense
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
