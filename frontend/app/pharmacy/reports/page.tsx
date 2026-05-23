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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Pharmacy Reports
        </h1>
        <p className="text-muted-foreground">
          Analytics across revenue, consumption, and inventory health
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTab)}>
        <TabsList>
          <TabsTrigger value="revenue">
            <IndianRupee className="h-4 w-4 mr-1" /> Revenue
          </TabsTrigger>
          <TabsTrigger value="consumption">
            <BarChart3 className="h-4 w-4 mr-1" /> Consumption
          </TabsTrigger>
          <TabsTrigger value="low-stock">
            <AlertTriangle className="h-4 w-4 mr-1" /> Low Stock
          </TabsTrigger>
          <TabsTrigger value="expiry">
            <CalendarClock className="h-4 w-4 mr-1" /> Expiry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-4">
          <RevenueReportTab />
        </TabsContent>
        <TabsContent value="consumption" className="mt-4">
          <ConsumptionReportTab />
        </TabsContent>
        <TabsContent value="low-stock" className="mt-4">
          <LowStockReportTab />
        </TabsContent>
        <TabsContent value="expiry" className="mt-4">
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
    <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr]">
      <Select
        value={state.range}
        onValueChange={(v) => onChange({ ...state, range: v as ReportRange })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">Daily</SelectItem>
          <SelectItem value="monthly">Monthly</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>
      {state.range === "daily" ? (
        <>
          <Input
            type="date"
            value={state.date}
            onChange={(e) => onChange({ ...state, date: e.target.value })}
          />
          <div />
        </>
      ) : state.range === "monthly" ? (
        <>
          <Input
            type="month"
            value={state.month}
            onChange={(e) => onChange({ ...state, month: e.target.value })}
          />
          <div />
        </>
      ) : (
        <>
          <Input
            type="date"
            value={state.startDate}
            onChange={(e) =>
              onChange({ ...state, startDate: e.target.value })
            }
            aria-label="Start date"
          />
          <Input
            type="date"
            value={state.endDate}
            onChange={(e) => onChange({ ...state, endDate: e.target.value })}
            aria-label="End date"
          />
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Revenue Report</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" /> CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4 mr-2" /> Print
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <RangeFilter state={filter} onChange={setFilter} />
          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : data ? (
            <>
              <p className="text-sm text-muted-foreground">
                Period:{" "}
                <span className="font-medium text-foreground">
                  {data.period}
                </span>
              </p>

              <div className="grid gap-3 md:grid-cols-4">
                <KpiCard
                  label="Total Revenue"
                  value={`₹${parseFloat(data.summary.total_revenue).toLocaleString("en-IN")}`}
                  trend
                />
                <KpiCard
                  label="Cash Sales"
                  value={`₹${parseFloat(data.summary.total_cash).toLocaleString("en-IN")}`}
                />
                <KpiCard
                  label="Online Sales"
                  value={`₹${parseFloat(data.summary.total_online).toLocaleString("en-IN")}`}
                />
                <KpiCard
                  label="Transactions"
                  value={data.summary.total_transactions}
                />
              </div>

              {chartData.length > 0 ? (
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
                            stopColor="oklch(0.6 0.18 145)"
                            stopOpacity={0.6}
                          />
                          <stop
                            offset="95%"
                            stopColor="oklch(0.6 0.18 145)"
                            stopOpacity={0.05}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="label" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip
                        formatter={(value: number) =>
                          `₹${value.toLocaleString("en-IN")}`
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="oklch(0.6 0.18 145)"
                        strokeWidth={2}
                        fill="url(#revGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sr.</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Day</TableHead>
                      <TableHead className="text-right">Cash</TableHead>
                      <TableHead className="text-right">Online</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Txns</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.breakdown.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-sm text-muted-foreground py-6"
                        >
                          No transactions in this period
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.breakdown.map((row, idx) => (
                        <TableRow key={`${row.date}-${idx}`}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>
                            {new Date(row.date).toLocaleDateString("en-IN")}
                          </TableCell>
                          <TableCell>{row.day_name}</TableCell>
                          <TableCell className="text-right">
                            ₹{parseFloat(row.cash).toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="text-right">
                            ₹{parseFloat(row.online).toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ₹{parseFloat(row.revenue).toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.transactions}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: string | number;
  trend?: boolean;
}) {
  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {trend ? (
          <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
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
    <Card>
      <CardHeader>
        <CardTitle>Consumption Report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RangeFilter state={filter} onChange={setFilter} />

        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-sm text-muted-foreground">Category:</Label>
          {(["All", "Rx", "NRx", "BUP"] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              variant={category === c ? "default" : "outline"}
              onClick={() => setCategory(c)}
            >
              {c}
            </Button>
          ))}
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
            <p className="text-sm text-muted-foreground">
              Period:{" "}
              <span className="font-medium text-foreground">{data.period}</span>
            </p>

            {category === "BUP" && groupedBup ? (
              Object.entries(groupedBup).map(([strength, rows]) => (
                <div key={strength}>
                  <h3 className="text-sm font-semibold mb-2">
                    BUP {strength}{" "}
                    <Badge variant="secondary" className="ml-2">
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
      <p className="text-sm text-muted-foreground py-4 text-center">
        No consumption in this period
      </p>
    );
  }
  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalValue = rows.reduce(
    (s, r) => s + (parseFloat(r.selling_value) || 0),
    0,
  );
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sr.</TableHead>
            <TableHead>Medicine</TableHead>
            <TableHead>Salt</TableHead>
            <TableHead className="text-right">Consumed</TableHead>
            <TableHead className="text-right">Selling Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, idx) => (
            <TableRow key={`${r.name}-${idx}`}>
              <TableCell>{idx + 1}</TableCell>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {r.salt}
              </TableCell>
              <TableCell className="text-right">{r.quantity}</TableCell>
              <TableCell className="text-right">
                ₹{parseFloat(r.selling_value).toLocaleString("en-IN")}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/40 font-semibold">
            <TableCell colSpan={3} className="text-right">
              Totals
            </TableCell>
            <TableCell className="text-right">{totalQty}</TableCell>
            <TableCell className="text-right">
              ₹{totalValue.toLocaleString("en-IN")}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
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
    <Card>
      <CardHeader>
        <CardTitle>Low Stock Report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {errorMessage ? (
          <p className="text-sm text-destructive">{errorMessage}</p>
        ) : null}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            All medicines are above their reorder level
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sr.</TableHead>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Salt</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Reorder Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, idx) => (
                  <TableRow key={it.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {it.salt}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{it.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className="border-rose-500 text-rose-700 bg-rose-50"
                      >
                        {it.current_stock} u
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {it.reorder_level} u
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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
