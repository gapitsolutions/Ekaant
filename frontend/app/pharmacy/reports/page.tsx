"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
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
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Download,
  IndianRupee,
  Loader2,
  Printer,
  TrendingUp,
} from "lucide-react";
import {
  getRevenueReport,
  getConsumptionReport,
  getLowStockReport,
  getExpiryReport,
  type RevenueReportResponse,
  type ConsumptionReportResponse,
  type LowStockReportItem,
  type ExpiryReportResponse,
  type ReportRange,
  type MedicineCategory,
} from "@/lib/pharmacy-api";

type ReportTab = "revenue" | "consumption" | "low-stock" | "expiry";

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("revenue");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-black text-[#0d7377] tracking-tight flex items-center gap-2">
          <BarChart3 className="h-7 w-7" />
          Pharmacy Reports
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Analytics across revenue, consumption, and inventory health
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTab)}>
        <TabsList className="bg-slate-100 p-1.5 rounded-2xl h-14 shadow-sm border border-slate-200">
          <TabsTrigger value="revenue" className="data-[state=active]:bg-[#0d7377] data-[state=active]:text-white rounded-xl font-bold">
            <IndianRupee className="h-4 w-4 mr-1" /> Revenue
          </TabsTrigger>
          <TabsTrigger value="consumption" className="data-[state=active]:bg-[#0d7377] data-[state=active]:text-white rounded-xl font-bold">
            <BarChart3 className="h-4 w-4 mr-1" /> Consumption
          </TabsTrigger>
          <TabsTrigger value="low-stock" className="data-[state=active]:bg-[#0d7377] data-[state=active]:text-white rounded-xl font-bold">
            <AlertTriangle className="h-4 w-4 mr-1" /> Low Stock
          </TabsTrigger>
          <TabsTrigger value="expiry" className="data-[state=active]:bg-[#0d7377] data-[state=active]:text-white rounded-xl font-bold">
            <CalendarClock className="h-4 w-4 mr-1" /> Expiry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-6">
          <RevenueReportTab />
        </TabsContent>
        <TabsContent value="consumption" className="mt-6">
          <ConsumptionReportTab />
        </TabsContent>
        <TabsContent value="low-stock" className="mt-6">
          <LowStockReportTab />
        </TabsContent>
        <TabsContent value="expiry" className="mt-6">
          <ExpiryReportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ────────── Shared Filter ──────────

interface RangeFilterState {
  range: ReportRange;
  date: string;
  month: string;
  startDate: string;
  endDate: string;
}

function defaultRangeState(): RangeFilterState {
  const now = new Date();
  return {
    range: "monthly",
    date: now.toISOString().slice(0, 10),
    month: now.toISOString().slice(0, 7),
    startDate: "",
    endDate: "",
  };
}

function RangeFilter({
  state,
  onChange,
}: {
  state: RangeFilterState;
  onChange: (next: RangeFilterState) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr] items-end">
      <div>
        <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Range</Label>
        <Select
          value={state.range}
          onValueChange={(v) => onChange({ ...state, range: v as ReportRange })}
        >
          <SelectTrigger className="bg-slate-50 border-slate-200 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-slate-200">
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {state.range === "daily" ? (
        <>
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Date</Label>
            <Input
              type="date"
              value={state.date}
              onChange={(e) => onChange({ ...state, date: e.target.value })}
              className="bg-slate-50 border-slate-200 rounded-xl"
            />
          </div>
          <div />
        </>
      ) : state.range === "monthly" ? (
        <>
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Month</Label>
            <Input
              type="month"
              value={state.month}
              onChange={(e) => onChange({ ...state, month: e.target.value })}
              className="bg-slate-50 border-slate-200 rounded-xl"
            />
          </div>
          <div />
        </>
      ) : (
        <>
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Start Date</Label>
            <Input
              type="date"
              value={state.startDate}
              onChange={(e) =>
                onChange({ ...state, startDate: e.target.value })
              }
              aria-label="Start date"
              className="bg-slate-50 border-slate-200 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">End Date</Label>
            <Input
              type="date"
              value={state.endDate}
              onChange={(e) => onChange({ ...state, endDate: e.target.value })}
              aria-label="End date"
              className="bg-slate-50 border-slate-200 rounded-xl"
            />
          </div>
        </>
      )}
    </div>
  );
}

function rangeToOptions(state: RangeFilterState) {
  return {
    range: state.range,
    date: state.range === "daily" ? state.date : undefined,
    month: state.range === "monthly" ? state.month : undefined,
    start_date: state.range === "custom" ? state.startDate : undefined,
    end_date: state.range === "custom" ? state.endDate : undefined,
  };
}

// ────────── Revenue Report ──────────

function RevenueReportTab() {
  const [filter, setFilter] = useState<RangeFilterState>(defaultRangeState());
  const [data, setData] = useState<RevenueReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(() => {
    setIsLoading(true);
    setErrorMessage("");
    return getRevenueReport(rangeToOptions(filter))
      .then(setData)
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load report.",
        );
        setData(null);
      })
      .finally(() => setIsLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const chartData = useMemo(() => {
    return (data?.breakdown || []).map((row) => ({
      date: row.date,
      label: new Date(row.date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      revenue: parseFloat(row.revenue) || 0,
      cash: parseFloat(row.cash) || 0,
      online: parseFloat(row.online) || 0,
    }));
  }, [data]);

  const handleExportCSV = () => {
    if (!data) return;
    const header = ["Date", "Day", "Cash", "Online", "Revenue", "Transactions"];
    const rows = data.breakdown.map((r) => [
      r.date,
      r.day_name,
      r.cash,
      r.online,
      r.revenue,
      r.transactions,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue_${data.period.replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Filter Area */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="text-sm font-bold text-slate-800">Report Filters</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="bg-[#0d7377] hover:bg-[#0a5c5f] text-white border-0 rounded-xl">
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="border-slate-200 rounded-xl hover:bg-slate-50"
            >
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
          </div>
        </div>
        <RangeFilter state={filter} onChange={setFilter} />
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          <p className="text-sm text-slate-500">
            Period:{" "}
            <span className="font-semibold text-slate-800">
              {data.period}
            </span>
          </p>

          <div className="grid gap-5 md:grid-cols-4">
            <KpiCard
              label="Total Revenue"
              value={`₹${parseFloat(data.summary.total_revenue).toLocaleString("en-IN")}`}
              trend
              accent="bg-emerald-500"
            />
            <KpiCard
              label="Cash Sales"
              value={`₹${parseFloat(data.summary.total_cash).toLocaleString("en-IN")}`}
              accent="bg-amber-500"
            />
            <KpiCard
              label="Online Sales"
              value={`₹${parseFloat(data.summary.total_online).toLocaleString("en-IN")}`}
              accent="bg-blue-500"
            />
            <KpiCard
              label="Transactions"
              value={data.summary.total_transactions}
              accent="bg-purple-500"
            />
          </div>

          {chartData.length > 0 ? (
            <Card className="rounded-2xl border-slate-100 shadow-sm bg-white overflow-hidden">
              <CardHeader className="border-b border-slate-50 p-6">
                <CardTitle className="text-base font-bold text-slate-800">Daily Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient
                          id="revGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#10b981"
                            stopOpacity={0.2}
                          />
                          <stop
                            offset="95%"
                            stopColor="#10b981"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" fontSize={11} axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                      <YAxis fontSize={11} axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value) =>
                          `₹${Number(value).toLocaleString("en-IN")}`
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={3}
                        fill="url(#revGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="rounded-2xl border-slate-100 shadow-sm bg-white overflow-hidden">
            <CardHeader className="border-b border-slate-50 p-6">
              <CardTitle className="text-base font-bold text-slate-800">Revenue Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Sr.</TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Date</TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Day</TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Cash</TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Online</TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-[#0d7377] text-right bg-teal-50/30">Revenue</TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Txns</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.breakdown.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-sm text-slate-500 py-8"
                      >
                        No transactions in this period
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.breakdown.map((row, idx) => (
                      <TableRow key={`${row.date}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="px-6 py-3.5 font-medium text-slate-400 text-sm">{idx + 1}</TableCell>
                        <TableCell className="px-6 py-3.5 font-semibold text-slate-700 text-sm">
                          {new Date(row.date).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell className="px-6 py-3.5 font-medium text-slate-500 text-sm">{row.day_name}</TableCell>
                        <TableCell className="px-6 py-3.5 text-right font-medium text-amber-600 text-sm">
                          ₹{parseFloat(row.cash).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="px-6 py-3.5 text-right font-medium text-blue-600 text-sm">
                          ₹{parseFloat(row.online).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="px-6 py-3.5 text-right font-black text-slate-900 text-sm bg-teal-50/30">
                          ₹{parseFloat(row.revenue).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="px-6 py-3.5 text-right font-medium text-slate-600 text-sm">
                          {row.transactions}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  trend,
  accent = "bg-primary",
}: {
  label: string;
  value: string | number;
  trend?: boolean;
  accent?: string;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl border-slate-100 shadow-sm bg-white">
      <div className={`h-1.5 w-full ${accent}`} />
      <CardContent className="p-5">
        <p className="text-4xl font-black text-slate-800">{value}</p>
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest mt-1">{label}</p>
        {trend ? (
          <p className="text-xs text-emerald-600 flex items-center gap-1 mt-2 font-medium">
            <TrendingUp className="h-3 w-3" />
            Live
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ────────── Consumption Report ──────────

function ConsumptionReportTab() {
  const [filter, setFilter] = useState<RangeFilterState>(defaultRangeState());
  const [category, setCategory] = useState<"All" | MedicineCategory>("All");
  const [data, setData] = useState<ConsumptionReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(() => {
    setIsLoading(true);
    setErrorMessage("");
    return getConsumptionReport({
      ...rangeToOptions(filter),
      category,
    })
      .then(setData)
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load consumption report.",
        );
        setData(null);
      })
      .finally(() => setIsLoading(false));
  }, [filter, category]);

  useEffect(() => {
    load();
  }, [load]);

  const groupedBup = useMemo(() => {
    if (category !== "BUP" || !data) return null;
    const groups: Record<string, ConsumptionReportResponse["medicine_breakdown"]> =
      {
        "0.4mg + 0.1mg": [],
        "1.0mg + 0.25mg": [],
        "2.0mg + 0.5mg": [],
      };
    data.medicine_breakdown.forEach((m) => {
      if (m.strength && groups[m.strength]) {
        groups[m.strength].push(m);
      }
    });
    return groups;
  }, [data, category]);

  return (
    <div className="space-y-6">
      {/* Filter Area */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4">Report Filters</h3>
        <RangeFilter state={filter} onChange={setFilter} />
      </div>

      {/* Category Selector */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category:</Label>
          {(["All", "Rx", "NRx", "BUP"] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              variant={category === c ? "default" : "outline"}
              onClick={() => setCategory(c)}
              className={category === c
                ? "bg-[#0d7377] hover:bg-[#0a5c5f] text-white border-0 rounded-xl font-bold"
                : "border-slate-200 rounded-xl font-bold hover:border-[#0d7377] hover:text-[#0d7377]"
              }
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          <p className="text-sm text-slate-500">
            Period:{" "}
            <span className="font-semibold text-slate-800">{data.period}</span>
          </p>

          {category === "BUP" && groupedBup ? (
            Object.entries(groupedBup).map(([strength, rows]) => (
              <div key={strength}>
                <h3 className="text-sm font-bold text-slate-700 mb-2">
                  BUP {strength}{" "}
                  <Badge variant="secondary" className="ml-2 rounded-lg">
                    {rows.length}
                  </Badge>
                </h3>
                <MedicineBreakdownTable rows={rows} />
              </div>
            ))
          ) : (
            <MedicineBreakdownTable rows={data.medicine_breakdown} />
          )}
        </>
      ) : null}
    </div>
  );
}

function MedicineBreakdownTable({
  rows,
}: {
  rows: ConsumptionReportResponse["medicine_breakdown"];
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <BarChart3 className="h-5 w-5 text-slate-400" />
        </div>
        <p className="text-sm font-bold text-slate-700">No consumption data</p>
        <p className="text-xs text-slate-400 mt-1">No consumption recorded in this period</p>
      </div>
    );
  }
  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalValue = rows.reduce(
    (s, r) => s + (parseFloat(r.selling_value) || 0),
    0,
  );
  return (
    <Card className="rounded-2xl border-slate-100 shadow-sm bg-white overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Sr.</TableHead>
            <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Medicine</TableHead>
            <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Salt</TableHead>
            <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Consumed</TableHead>
            <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-[#0d7377] text-right bg-teal-50/30">Selling Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, idx) => (
            <TableRow key={`${r.name}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
              <TableCell className="px-6 py-3.5 font-medium text-slate-400 text-sm">{idx + 1}</TableCell>
              <TableCell className="px-6 py-3.5 font-semibold text-slate-700 text-sm">{r.name}</TableCell>
              <TableCell className="px-6 py-3.5 font-medium text-slate-500 text-sm">
                {r.salt}
              </TableCell>
              <TableCell className="px-6 py-3.5 text-right font-medium text-slate-700 text-sm">{r.quantity}</TableCell>
              <TableCell className="px-6 py-3.5 text-right font-black text-slate-900 text-sm bg-teal-50/30">
                ₹{parseFloat(r.selling_value).toLocaleString("en-IN")}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-teal-50/20 hover:bg-teal-50/30 border-t-2 border-teal-100">
            <TableCell colSpan={3} className="px-6 py-3.5 text-right font-bold text-[#0d7377] text-sm uppercase tracking-wider">
              Totals
            </TableCell>
            <TableCell className="px-6 py-3.5 text-right font-bold text-[#0d7377] text-sm">{totalQty}</TableCell>
            <TableCell className="px-6 py-3.5 text-right font-black text-[#0d7377] text-sm bg-teal-50/40">
              ₹{totalValue.toLocaleString("en-IN")}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  );
}

// ────────── Low Stock Report ──────────

function LowStockReportTab() {
  const [items, setItems] = useState<LowStockReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setIsLoading(true);
    setErrorMessage("");
    getLowStockReport()
      .then((data) => setItems(data.items || []))
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load low stock report.",
        );
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card className="rounded-2xl border-slate-100 shadow-sm bg-white">
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-slate-700">All stock levels healthy</p>
              <p className="text-xs text-slate-400 mt-1">All medicines are above their reorder level</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-slate-100 shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-50 p-6">
            <CardTitle className="text-base font-bold text-slate-800">Low Stock Report</CardTitle>
            <p className="text-xs text-slate-500 mt-1">Medicines that are at or below their reorder level</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Sr.</TableHead>
                  <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Medicine</TableHead>
                  <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Salt</TableHead>
                  <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Category</TableHead>
                  <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Remaining</TableHead>
                  <TableHead className="h-11 px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Reorder Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, idx) => (
                  <TableRow key={it.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="px-6 py-3.5 font-medium text-slate-400 text-sm">{idx + 1}</TableCell>
                    <TableCell className="px-6 py-3.5 font-semibold text-slate-700 text-sm">{it.name}</TableCell>
                    <TableCell className="px-6 py-3.5 font-medium text-slate-500 text-sm">
                      {it.salt}
                    </TableCell>
                    <TableCell className="px-6 py-3.5">
                      <Badge variant="outline" className="rounded-lg border-slate-200">{it.category}</Badge>
                    </TableCell>
                    <TableCell className="px-6 py-3.5 text-right">
                      <Badge
                        variant="outline"
                        className="border-rose-500 text-rose-700 bg-rose-50 rounded-lg"
                      >
                        {it.current_stock} u
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-3.5 text-right font-medium text-slate-500 text-sm">
                      {it.reorder_level} u
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ────────── Expiry Report ──────────

function ExpiryReportTab() {
  const [data, setData] = useState<ExpiryReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setIsLoading(true);
    setErrorMessage("");
    getExpiryReport()
      .then(setData)
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load expiry report.",
        );
        setData(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            Expired Medicines
            {data ? (
              <Badge variant="secondary">{data.expired.length}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data || data.expired.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No expired batches in active inventory
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Days Overdue</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expired.map((r) => (
                    <TableRow key={`${r.medicine_id}-${r.batch_number}`}>
                      <TableCell className="font-medium">
                        {r.medicine_name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {r.batch_number}
                      </TableCell>
                      <TableCell>
                        {new Date(r.expiry_date).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="border-rose-500 text-rose-700 bg-rose-50"
                        >
                          {r.days_overdue ?? "—"} days
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{r.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-amber-600" />
            Near Expiry (within 180 days)
            {data ? (
              <Badge variant="secondary">{data.near_expiry.length}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data || data.near_expiry.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No batches nearing expiry
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Days Remaining</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.near_expiry.map((r) => (
                    <TableRow key={`${r.medicine_id}-${r.batch_number}`}>
                      <TableCell className="font-medium">
                        {r.medicine_name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {r.batch_number}
                      </TableCell>
                      <TableCell>
                        {new Date(r.expiry_date).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="border-amber-500 text-amber-700 bg-amber-50"
                        >
                          {r.days_until_expiry ?? "—"} days
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{r.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
