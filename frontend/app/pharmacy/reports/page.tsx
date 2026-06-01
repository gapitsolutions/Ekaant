"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CalendarDays,
  Download,
  IndianRupee,
  Loader2,
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
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-24">
      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTab)}>
        <div className="flex flex-col gap-6">
          <PageHeader
            title="Pharmacy Reports"
            subtitle="Revenue analysis and medicine consumption tracking"
            actions={
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="border-slate-200 text-slate-700 font-medium rounded-md px-4 h-9 shadow-sm hover:bg-slate-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            }
          />

          <TabsList className="flex flex-wrap items-center gap-1 p-1 bg-slate-100/80 rounded-lg h-auto sm:h-11 w-max border border-slate-200">
            <TabsTrigger
              value="revenue"
              className="px-6 py-1.5 rounded-md text-sm font-bold transition-all h-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm text-slate-500 hover:text-slate-700"
            >
              Revenue Report
            </TabsTrigger>
            <TabsTrigger
              value="consumption"
              className="px-6 py-1.5 rounded-md text-sm font-bold transition-all h-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm text-slate-500 hover:text-slate-700"
            >
              Consumption Report
            </TabsTrigger>
            <TabsTrigger
              value="low-stock"
              className="px-6 py-1.5 rounded-md text-sm font-bold transition-all h-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm text-slate-500 hover:text-slate-700"
            >
              Low Stock Report
            </TabsTrigger>
            <TabsTrigger
              value="expiry"
              className="px-6 py-1.5 rounded-md text-sm font-bold transition-all h-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm text-slate-500 hover:text-slate-700"
            >
              Expiry Report
            </TabsTrigger>
          </TabsList>
        </div>

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

// Compact horizontal filter — label + control pairs in a row.
// This layout is more space-efficient than the previous column grid and keeps
// the period context visible inline without scrolling.
function RangeFilter({
  state,
  onChange,
}: {
  state: RangeFilterState;
  onChange: (next: RangeFilterState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 lg:gap-4">
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
          Range:
        </Label>
        <Select
          value={state.range}
          onValueChange={(v) => onChange({ ...state, range: v as ReportRange })}
        >
          <SelectTrigger className="w-full sm:w-[140px] h-9 text-sm border-slate-200 rounded-lg bg-white">
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
        <div className="flex items-center gap-2 animate-in slide-in-from-left-2 w-full sm:w-auto">
          <Label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
            Date:
          </Label>
          <Input
            type="date"
            value={state.date}
            onChange={(e) => onChange({ ...state, date: e.target.value })}
            className="h-9 w-full sm:w-[150px] text-sm rounded-lg border-slate-200 bg-white"
          />
        </div>
      ) : state.range === "monthly" ? (
        <div className="flex items-center gap-2 animate-in slide-in-from-left-2 w-full sm:w-auto">
          <Label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
            Month:
          </Label>
          <Input
            type="month"
            value={state.month}
            onChange={(e) => onChange({ ...state, month: e.target.value })}
            className="h-9 w-full sm:w-[150px] text-sm rounded-lg border-slate-200 bg-white"
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 animate-in slide-in-from-left-2 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              From:
            </Label>
            <Input
              type="date"
              value={state.startDate}
              onChange={(e) =>
                onChange({ ...state, startDate: e.target.value })
              }
              aria-label="Start date"
              className="h-9 w-full sm:w-[130px] text-sm rounded-lg border-slate-200 bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              To:
            </Label>
            <Input
              type="date"
              value={state.endDate}
              onChange={(e) => onChange({ ...state, endDate: e.target.value })}
              aria-label="End date"
              className="h-9 w-full sm:w-[130px] text-sm rounded-lg border-slate-200 bg-white"
            />
          </div>
        </div>
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
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {/* Filter Area */}
      <Card className="border-slate-200 shadow-sm rounded-xl bg-white">
        <CardContent className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-800 text-sm whitespace-nowrap">
              Report Filters
            </h3>
            {data?.period ? (
              <div className="bg-teal-50 text-primary px-3 py-1 rounded-full text-xs font-black tracking-wide border border-teal-100 shadow-sm whitespace-nowrap">
                {data.period}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:gap-4">
            <RangeFilter state={filter} onChange={setFilter} />
            <div className="flex items-center gap-2">
              <Button
                onClick={handleExportCSV}
                size="sm"
                variant="outline"
                disabled={!data}
                className="border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm"
              >
                <Download className="h-4 w-4 mr-2 text-slate-400" />
                Download CSV
              </Button>
              <Button
                onClick={() => window.print()}
                size="sm"
                variant="outline"
                className="border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm"
              >
                <Download className="h-4 w-4 mr-2 text-rose-400" />
                Download PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <KpiCard
              label="Total Revenue"
              value={`₹${parseFloat(data.summary.total_revenue).toLocaleString("en-IN")}`}
              trend
              icon={<IndianRupee className="h-5 w-5 text-emerald-600" />}
              iconBg="bg-emerald-100"
            />
            <KpiCard
              label="Cash Sales"
              value={`₹${parseFloat(data.summary.total_cash).toLocaleString("en-IN")}`}
              icon={<IndianRupee className="h-5 w-5 text-amber-600" />}
              iconBg="bg-amber-100"
            />
            <KpiCard
              label="Online Sales"
              value={`₹${parseFloat(data.summary.total_online).toLocaleString("en-IN")}`}
              icon={<Activity className="h-5 w-5 text-blue-600" />}
              iconBg="bg-blue-100"
            />
            <KpiCard
              label="Transactions"
              value={data.summary.total_transactions}
              icon={<CalendarDays className="h-5 w-5 text-purple-600" />}
              iconBg="bg-purple-100"
            />
          </div>

          <Card className="border-slate-200 shadow-sm rounded-xl bg-white overflow-hidden">
            <CardHeader className="border-b border-slate-50 p-6">
              <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                Revenue Breakdown
                <span className="text-primary bg-teal-50 px-2 py-0.5 rounded text-xs">
                  ({data.period})
                </span>
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Daily breakdown for the selected period
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                      Sr. No.
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                      Date
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                      Day
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500 text-right">
                      Cash
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500 text-right">
                      Online
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-primary text-right bg-teal-50/30">
                      Total Revenue
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500 text-right">
                      Txns
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-50">
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
                      <TableRow
                        key={`${row.date}-${idx}`}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <TableCell className="px-6 py-3.5 font-medium text-slate-400 text-sm">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="px-6 py-3.5 font-semibold text-slate-700 text-sm">
                          {new Date(row.date).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell className="px-6 py-3.5 font-medium text-slate-500 text-sm">
                          {row.day_name}
                        </TableCell>
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

          {chartData.length > 0 ? (
            <Card className="border-slate-200 shadow-sm rounded-xl bg-white overflow-hidden">
              <CardHeader className="border-b border-slate-50 p-6">
                <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                  Daily Revenue Trend
                  <span className="text-primary bg-teal-50 px-2 py-0.5 rounded text-xs">
                    ({data.period})
                  </span>
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Visual trend of revenue generation
                </p>
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
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#f1f5f9"
                      />
                      <XAxis
                        dataKey="label"
                        fontSize={11}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#64748b" }}
                      />
                      <YAxis
                        fontSize={11}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#64748b" }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
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
        </>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  trend,
  icon,
  iconBg = "bg-slate-100",
}: {
  label: string;
  value: string | number;
  trend?: boolean;
  icon?: ReactNode;
  iconBg?: string;
}) {
  return (
    <Card className="border-slate-200 shadow-sm rounded-xl bg-white p-6">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">{label}</p>
          <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        </div>
        {icon ? (
          <div
            className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}
          >
            {icon}
          </div>
        ) : null}
      </div>
      {trend ? (
        <p className="text-xs text-emerald-600 flex items-center gap-1 mt-3 font-semibold">
          <TrendingUp className="h-3 w-3" />
          Live
        </p>
      ) : null}
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
    const groups: Record<
      string,
      ConsumptionReportResponse["medicine_breakdown"]
    > = {
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
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {/* Filter Area */}
      <Card className="border-slate-200 shadow-sm rounded-xl bg-white">
        <CardContent className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-800 text-sm whitespace-nowrap">
              Report Filters
            </h3>
            {data?.period ? (
              <div className="bg-teal-50 text-primary px-3 py-1 rounded-full text-xs font-black tracking-wide border border-teal-100 shadow-sm whitespace-nowrap">
                {data.period}
              </div>
            ) : null}
          </div>
          <RangeFilter state={filter} onChange={setFilter} />
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm rounded-xl bg-white">
        <CardContent className="p-4 sm:p-5 flex flex-wrap items-center gap-3">
          <Label className="text-sm font-semibold text-slate-600 mr-2">
            Medicine Categories:
          </Label>
          {(["All", "Rx", "NRx", "BUP"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              type="button"
              className={`px-5 py-2 rounded-lg text-xs font-bold transition-all border shadow-sm ${
                category === c
                  ? "bg-primary text-white border-primary"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:border-primary hover:text-primary"
              }`}
            >
              {c}
            </button>
          ))}
        </CardContent>
      </Card>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          {/* Consumption trend chart — shows daily RX/NRx/BUP dispensing pattern.
              Uses real trend_data returned by the backend; the AI version had this
              chart but powered by Math.random() fabrications. */}
          {data.trend_data.length > 1 ? (
            <ConsumptionTrendChart rows={data.trend_data} category={category} />
          ) : null}

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

// ────────── Consumption Trend Chart ──────────
// Renders real trend_data from the backend — daily RX / NRx / BUP dispensing.
// Only shown when there are ≥2 data points (a single day has no trend to draw).
// When the user filters by a specific category, irrelevant bars are hidden so
// the chart stays readable without cluttering with zero-value series.

const TREND_COLORS = {
  rx: "#0d7377",
  nrx: "#f59e0b",
  bup: "#6366f1",
} as const;

function ConsumptionTrendChart({
  rows,
  category,
}: {
  rows: { date: string; rx: number; nrx: number; bup: number; total: number }[];
  category: "All" | "Rx" | "NRx" | "BUP";
}) {
  const chartData = rows.map((r) => ({
    label: new Date(r.date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }),
    rx: r.rx,
    nrx: r.nrx,
    bup: r.bup,
    total: r.total,
  }));

  const showRx = category === "All" || category === "Rx";
  const showNrx = category === "All" || category === "NRx";
  const showBup = category === "All" || category === "BUP";

  return (
    <Card className="border-slate-200 shadow-sm rounded-xl bg-white overflow-hidden">
      <CardHeader className="border-b border-slate-50 p-6">
        <CardTitle className="text-base font-bold text-slate-800">
          Daily Dispensing Trend
        </CardTitle>
        <p className="text-xs text-slate-500 mt-0.5">
          Units dispensed per day, broken down by category
        </p>
      </CardHeader>
      <CardContent className="p-6">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#f1f5f9"
              />
              <XAxis
                dataKey="label"
                fontSize={11}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748b" }}
              />
              <YAxis
                fontSize={11}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748b" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                formatter={(value, name) => [value, String(name).toUpperCase()]}
              />
              <Legend
                formatter={(value) => (
                  <span className="text-xs font-semibold text-slate-600 uppercase">
                    {value}
                  </span>
                )}
              />
              {showRx ? (
                <Bar
                  dataKey="rx"
                  name="Rx"
                  fill={TREND_COLORS.rx}
                  radius={[4, 4, 0, 0]}
                />
              ) : null}
              {showNrx ? (
                <Bar
                  dataKey="nrx"
                  name="NRx"
                  fill={TREND_COLORS.nrx}
                  radius={[4, 4, 0, 0]}
                />
              ) : null}
              {showBup ? (
                <Bar
                  dataKey="bup"
                  name="BUP"
                  fill={TREND_COLORS.bup}
                  radius={[4, 4, 0, 0]}
                />
              ) : null}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
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
        <p className="text-xs text-slate-400 mt-1">
          No consumption recorded in this period
        </p>
      </div>
    );
  }
  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalValue = rows.reduce(
    (s, r) => s + (parseFloat(r.selling_value) || 0),
    0,
  );
  return (
    <Card className="border-slate-200 shadow-sm rounded-xl bg-white overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50/80 border-b border-slate-100">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
              Sr.
            </TableHead>
            <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
              Medicine
            </TableHead>
            <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
              Salt
            </TableHead>
            <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500 text-right">
              Consumed
            </TableHead>
            <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-primary text-right bg-teal-50/30">
              Selling Value
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-slate-50">
          {rows.map((r, idx) => (
            <TableRow
              key={`${r.name}-${idx}`}
              className="hover:bg-slate-50/50 transition-colors"
            >
              <TableCell className="px-6 py-3.5 font-medium text-slate-400 text-sm">
                {idx + 1}
              </TableCell>
              <TableCell className="px-6 py-3.5 font-semibold text-slate-700 text-sm">
                {r.name}
              </TableCell>
              <TableCell className="px-6 py-3.5 font-medium text-slate-500 text-sm">
                {r.salt}
              </TableCell>
              <TableCell className="px-6 py-3.5 text-right font-medium text-slate-700 text-sm">
                {r.quantity}
              </TableCell>
              <TableCell className="px-6 py-3.5 text-right font-black text-slate-900 text-sm bg-teal-50/30">
                ₹{parseFloat(r.selling_value).toLocaleString("en-IN")}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-teal-50/20 hover:bg-teal-50/30 border-t-2 border-teal-100">
            <TableCell
              colSpan={3}
              className="px-6 py-3.5 text-right font-bold text-primary text-sm uppercase tracking-wider"
            >
              Totals
            </TableCell>
            <TableCell className="px-6 py-3.5 text-right font-bold text-primary text-sm">
              {totalQty}
            </TableCell>
            <TableCell className="px-6 py-3.5 text-right font-black text-primary text-sm bg-teal-50/40">
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
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card className="border-slate-200 shadow-sm rounded-xl bg-white">
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-slate-700">
                All stock levels healthy
              </p>
              <p className="text-xs text-slate-400 mt-1">
                All medicines are above their reorder level
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 shadow-sm rounded-xl bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-50 p-6">
            <CardTitle className="text-base font-bold text-slate-800">
              Low Stock Report
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Medicines that are at or below their reorder level
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                    Sr.
                  </TableHead>
                  <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                    Medicine
                  </TableHead>
                  <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                    Salt
                  </TableHead>
                  <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                    Category
                  </TableHead>
                  <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500 text-right">
                    Remaining
                  </TableHead>
                  <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500 text-right">
                    Reorder Level
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-50">
                {items.map((it, idx) => (
                  <TableRow
                    key={it.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <TableCell className="px-6 py-3.5 font-medium text-slate-400 text-sm">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="px-6 py-3.5 font-semibold text-slate-700 text-sm">
                      {it.name}
                    </TableCell>
                    <TableCell className="px-6 py-3.5 font-medium text-slate-500 text-sm">
                      {it.salt}
                    </TableCell>
                    <TableCell className="px-6 py-3.5">
                      <Badge
                        variant="outline"
                        className="rounded-lg border-slate-200"
                      >
                        {it.category}
                      </Badge>
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
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      <Card className="border-slate-200 shadow-sm rounded-xl bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-50 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Expired Medicines
              {data ? (
                <Badge variant="secondary">{data.expired.length}</Badge>
              ) : null}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Medicines that have already expired and need to be removed.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!data || data.expired.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No expired batches in active inventory
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                      Medicine
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                      Batch No.
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                      Expiry Date
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                      Days Overdue
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500 text-right">
                      Quantity
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-50">
                  {data.expired.map((r) => (
                    <TableRow
                      key={`${r.medicine_id}-${r.batch_number}`}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <TableCell className="px-6 py-3.5 font-semibold text-slate-700 text-sm">
                        {r.medicine_name}
                      </TableCell>
                      <TableCell className="px-6 py-3.5 font-mono text-slate-500 text-sm">
                        {r.batch_number}
                      </TableCell>
                      <TableCell className="px-6 py-3.5 font-bold text-red-600 text-sm">
                        {new Date(r.expiry_date).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell className="px-6 py-3.5">
                        <Badge
                          variant="outline"
                          className="border-rose-500 text-rose-700 bg-rose-50"
                        >
                          {r.days_overdue ?? "—"} days
                        </Badge>
                      </TableCell>
                      <TableCell className="px-6 py-3.5 text-right font-medium text-slate-700 text-sm">
                        {r.quantity}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm rounded-xl bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-50 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-bold text-orange-500 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-600" />
              Near Expiry (within 180 days)
              {data ? (
                <Badge variant="secondary">{data.near_expiry.length}</Badge>
              ) : null}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Medicines expiring within the next 180 days.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!data || data.near_expiry.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No batches nearing expiry
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                      Medicine
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                      Batch No.
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                      Expiry Date
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500">
                      Days Remaining
                    </TableHead>
                    <TableHead className="h-11 px-6 font-bold uppercase text-xs tracking-wider text-slate-500 text-right">
                      Quantity
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-50">
                  {data.near_expiry.map((r) => (
                    <TableRow
                      key={`${r.medicine_id}-${r.batch_number}`}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <TableCell className="px-6 py-3.5 font-semibold text-slate-700 text-sm">
                        {r.medicine_name}
                      </TableCell>
                      <TableCell className="px-6 py-3.5 font-mono text-slate-500 text-sm">
                        {r.batch_number}
                      </TableCell>
                      <TableCell className="px-6 py-3.5 font-bold text-orange-500 text-sm">
                        {new Date(r.expiry_date).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell className="px-6 py-3.5">
                        <Badge
                          variant="outline"
                          className="border-amber-500 text-amber-700 bg-amber-50"
                        >
                          {r.days_until_expiry ?? "—"} days
                        </Badge>
                      </TableCell>
                      <TableCell className="px-6 py-3.5 text-right font-medium text-slate-700 text-sm">
                        {r.quantity}
                      </TableCell>
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
