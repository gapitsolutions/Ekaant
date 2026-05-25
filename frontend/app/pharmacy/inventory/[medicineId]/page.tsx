"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Download, Loader2, Package, Pill } from "lucide-react";
import { navigate } from "@/lib/navigation";
import {
  getMedicineById,
  getProductDispenseHistory,
  type Medicine,
  type ProductDispenseHistoryItem,
} from "@/lib/pharmacy-api";

type FilterMode = "month" | "day";

export default function MedicineDetailPage() {
  const params = useParams();
  const medicineId = String(params?.medicineId || "");

  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [items, setItems] = useState<ProductDispenseHistoryItem[]>([]);
  const [totalQuantity, setTotalQuantity] = useState(0);
  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const [filterMonth, setFilterMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [filterDate, setFilterDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadHistory = useCallback(() => {
    if (!medicineId) return Promise.resolve();
    setIsLoading(true);
    setErrorMessage("");
    return getProductDispenseHistory(medicineId, {
      month: filterMode === "month" ? filterMonth : undefined,
      date: filterMode === "day" ? filterDate : undefined,
    })
      .then((data) => {
        setItems(data.items || []);
        setTotalQuantity(data.total_quantity || 0);
      })
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load dispense history.",
        );
        setItems([]);
        setTotalQuantity(0);
      })
      .finally(() => setIsLoading(false));
  }, [medicineId, filterMode, filterMonth, filterDate]);

  useEffect(() => {
    if (!medicineId) return;
    getMedicineById(medicineId)
      .then(setMedicine)
      .catch(() => setMedicine(null));
  }, [medicineId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const currentStock = useMemo(() => {
    if (!medicine) return 0;
    return medicine.batches?.reduce((s, b) => s + (b.quantity || 0), 0) || 0;
  }, [medicine]);

  const handleExportCSV = () => {
    if (items.length === 0) return;
    const header = [
      "Date",
      "Time",
      "Patient Name",
      "Patient UID",
      "Batch Number",
      "Expiry Date",
      "Quantity",
      "Total Price",
    ];
    const rows = items.map((it) => {
      const dt = new Date(it.dispense_date);
      return [
        dt.toLocaleDateString("en-IN"),
        dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        it.patient_name,
        it.patient_id,
        it.batch_number,
        it.expiry_date,
        it.quantity,
        it.total_price,
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${medicine?.name || "medicine"}_dispense_history.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/pharmacy/inventory")}
          aria-label="Back to inventory"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Product Dispense History
          </h1>
          <p className="text-muted-foreground">
            Per-medicine consumption log with export
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2 border-0 shadow-md">
          <CardHeader className="border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Pill className="h-4 w-4 text-primary" />
              Medicine Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {medicine ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium">{medicine.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Salt</p>
                  <p className="font-medium">{medicine.salt}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <Badge variant="outline" className="mt-1">
                    {medicine.category}
                    {medicine.bup_category ? ` · ${medicine.bup_category}` : ""}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Selling Price
                  </p>
                  <p className="font-medium">
                    ₹{parseFloat(medicine.selling_price).toFixed(2)}
                  </p>
                </div>
                <div className="col-span-2 md:col-span-4">
                  <p className="text-xs text-muted-foreground">Total Dispensed</p>
                  <p className="text-2xl font-bold text-primary">
                    {totalQuantity}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      units
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Loading medicine details…
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Current Stock
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <p className="text-3xl font-bold">{currentStock}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Across {medicine?.batches?.length || 0} active batch
              {(medicine?.batches?.length || 0) === 1 ? "" : "es"}
            </p>
            {medicine && currentStock <= medicine.reorder_level ? (
              <Badge
                variant="outline"
                className="mt-2 border-rose-500 text-rose-700 bg-rose-50"
              >
                At or below reorder level ({medicine.reorder_level})
              </Badge>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Dispense Logs</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={items.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[180px_1fr]">
            <Tabs
              value={filterMode}
              onValueChange={(v) => setFilterMode(v as FilterMode)}
            >
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="month">By Month</TabsTrigger>
                <TabsTrigger value="day">By Day</TabsTrigger>
              </TabsList>
            </Tabs>
            {filterMode === "month" ? (
              <Input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
              />
            ) : (
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            )}
          </div>

          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground font-medium">
                No dispense records
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Try a different time period
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date &amp; Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="text-right">Total Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => {
                    const dt = new Date(it.dispense_date);
                    return (
                      <TableRow key={it.id}>
                        <TableCell>
                          <div className="text-sm">
                            {dt.toLocaleDateString("en-IN")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {dt.toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">
                            {it.patient_name}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {it.patient_id?.slice(0, 8) || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">
                            {it.batch_number}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(it.expiry_date).toLocaleDateString("en-IN", {
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>{it.quantity}</TableCell>
                        <TableCell className="text-right font-medium">
                          ₹{parseFloat(it.total_price).toLocaleString("en-IN")}
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
