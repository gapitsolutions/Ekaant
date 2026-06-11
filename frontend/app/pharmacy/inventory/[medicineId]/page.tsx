"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
import { Activity, AlertTriangle, ArrowLeft, Calendar, Download, Loader2, Package, Pill } from "lucide-react";
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
      "File Number",
      "Batch Number",
      "Expiry Date",
      "Quantity",
      "Total Price",
    ];
    const rows = items.map((it) => {
      const dt = new Date(it.dispense_time);
      return [
        dt.toLocaleDateString("en-IN"),
        dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        it.patient_name,
        it.file_number || "",
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

  const isLowStock = medicine ? currentStock <= medicine.reorder_level : false;

  return (
    <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        className="border-b border-slate-100 pb-4"
        leading={
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/pharmacy/inventory")}
            aria-label="Back to inventory"
            className="h-10 w-10 rounded-xl border-slate-200 text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        }
        title="Product Dispense History"
        subtitle="Track which patient received how much quantity from which batch."
      />

      {medicine ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-sm flex-shrink-0 ${
                medicine.category === "BUP" ? "bg-rose-50 border-rose-100" : "bg-slate-50 border-slate-100"
              }`}>
                <Pill className={`h-7 w-7 ${medicine.category === "BUP" ? "text-rose-600" : "text-slate-500"}`} />
              </div>
              <div>
                <h2 className="font-extrabold text-slate-800 text-xl tracking-tight">{medicine.name}</h2>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{medicine.salt}</span>
                  <Badge variant="outline" className={`font-bold text-[9px] uppercase px-1.5 py-0 rounded ${
                    medicine.category === "BUP" ? "text-rose-600 border-rose-200 bg-rose-50" :
                    medicine.category === "Rx" ? "text-blue-600 border-blue-200 bg-blue-50" :
                    "text-amber-600 border-amber-200 bg-amber-50"
                  }`}>
                    {medicine.category}
                    {medicine.bup_category ? ` · ${medicine.bup_category}` : ""}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Selling Price</p>
                <p className="font-extrabold text-slate-800 text-lg">₹{parseFloat(medicine.selling_price).toFixed(2)}</p>
              </div>
              <div className="w-px bg-slate-100" />
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Dispensed</p>
                <p className="font-extrabold text-primary text-lg">{totalQuantity} units</p>
              </div>
            </div>
          </div>

          <div className={`bg-white border rounded-2xl shadow-sm p-6 flex flex-col justify-center items-center text-center ${isLowStock ? "border-rose-200" : "border-slate-200"}`}>
            <Activity className={`h-6 w-6 mb-2 ${isLowStock ? "text-rose-500" : "text-primary"}`} />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Stock</p>
            <p className={`font-black text-2xl tracking-tight ${isLowStock ? "text-rose-600" : "text-slate-800"}`}>
              {currentStock}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {medicine.batches?.length || 0} batch{(medicine.batches?.length || 0) === 1 ? "" : "es"}
            </p>
            {isLowStock && (
              <Badge className="bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[9px] mt-2">
                <AlertTriangle className="h-3 w-3 mr-1" /> Reorder Needed
              </Badge>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic">Loading medicine details…</p>
      )}

      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="py-4 px-6 border-b border-slate-100 bg-white">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <CardTitle className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Dispense Logs
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <Tabs
                value={filterMode}
                onValueChange={(v) => setFilterMode(v as FilterMode)}
              >
                <TabsList className="bg-slate-100 p-1 rounded-lg">
                  <TabsTrigger value="month" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-primary font-medium text-sm">By Month</TabsTrigger>
                  <TabsTrigger value="day" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-primary font-medium text-sm">By Day</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                {filterMode === "month" ? (
                  <Input
                    type="month"
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="pl-9 h-10 bg-white border-slate-200 rounded-lg font-medium text-slate-700 text-sm w-44"
                  />
                ) : (
                  <Input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="pl-9 h-10 bg-white border-slate-200 rounded-lg font-medium text-slate-700 text-sm w-44"
                  />
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleExportCSV}
                disabled={items.length === 0}
                className="h-10 w-10 rounded-lg border-slate-200 bg-white hover:bg-slate-50"
                title="Download CSV"
              >
                <Download className="h-4 w-4 text-slate-500" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {errorMessage ? (
            <p className="py-4 px-6 text-sm text-destructive">{errorMessage}</p>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="px-6 h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">Date &amp; Time</TableHead>
                <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">Patient Details</TableHead>
                <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Batch</TableHead>
                <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Qty</TableHead>
                <TableHead className="px-6 h-10 text-right font-bold uppercase text-[10px] tracking-wider text-slate-500">Total Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-16">
                    <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-500">No dispense logs found for the selected period.</p>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => {
                  const dt = new Date(it.dispense_time);
                  return (
                    <TableRow key={it.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="px-6 py-3">
                        <span className="font-bold text-slate-700 block text-xs">
                          {dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-slate-800 block text-sm">{it.patient_name}</span>
                        <span className="text-[10px] text-slate-500 font-mono tracking-tight uppercase">
                          FILE: {it.file_number || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono text-[10px] text-slate-600 bg-white border-slate-200">
                          {it.batch_number}
                        </Badge>
                        <span className="block text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                          Exp: {new Date(it.expiry_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-black text-primary">{it.quantity}</span>
                      </TableCell>
                      <TableCell className="px-6 text-right font-extrabold text-slate-700 text-sm">
                        ₹{parseFloat(it.total_price).toLocaleString("en-IN")}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
