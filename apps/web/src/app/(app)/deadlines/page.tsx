"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "../../../lib/api";
import { cn, fmtDate } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Spinner,
  Button,
  EmptyState,
} from "@/components/ui";
import {
  Calendar,
  CalendarClock,
  List,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Clock,
  CheckCircle,
  X,
} from "lucide-react";
import type {
  ApiResponse,
  PaginatedResponse,
  ExtractedDeadline,
  DeadlineCalendarEntry,
} from "@ai-accounting/shared";

// ─── Types ───────────────────────────────────────────

interface CalendarData {
  month: number;
  year: number;
  entries: DeadlineCalendarEntry[];
  totalDeadlines: number;
}

interface ClientOption {
  id: string;
  name: string;
}

// ─── Colour helpers ──────────────────────────────────

function getDeadlineColour(dateStr: string): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr);
  deadline.setHours(0, 0, 0, 0);
  const diffDays = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return "bg-red-500"; // past
  if (diffDays <= 7) return "bg-orange-500"; // next 7 days
  return "bg-green-500"; // future
}

function getDeadlineTextColour(dateStr: string): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr);
  deadline.setHours(0, 0, 0, 0);
  const diffDays = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return "text-red-600";
  if (diffDays <= 7) return "text-orange-600";
  return "text-green-600";
}

function getConfidenceBadge(confidence: string) {
  switch (confidence) {
    case "HIGH":
      return <Badge variant="success">High</Badge>;
    case "MEDIUM":
      return <Badge variant="warning">Medium</Badge>;
    case "LOW":
      return <Badge variant="default">Low</Badge>;
    default:
      return <Badge variant="default">{confidence}</Badge>;
  }
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Main component ─────────────────────────────────

export default function DeadlinesPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [listData, setListData] = useState<ExtractedDeadline[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listPage, setListPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<string>("");
  const [clients, setClients] = useState<ClientOption[]>([]);

  // Fetch clients for filter
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<ApiResponse<ClientOption[]>>("/api/clients");
        if (res.success && res.data) {
          setClients(res.data);
        }
      } catch {
        // Non-critical
      }
    })();
  }, []);

  // Fetch calendar data
  const fetchCalendar = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        month: month.toString(),
        year: year.toString(),
      });
      if (clientFilter) params.set("clientId", clientFilter);

      const res = await apiFetch<ApiResponse<CalendarData>>(
        `/api/deadlines/calendar?${params}`,
      );
      if (res.success && res.data) {
        setCalendarData(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deadlines");
    } finally {
      setLoading(false);
    }
  }, [month, year, clientFilter]);

  // Fetch list data
  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: listPage.toString(),
        limit: "50",
      });
      if (clientFilter) params.set("clientId", clientFilter);

      const res = await apiFetch<PaginatedResponse<ExtractedDeadline>>(
        `/api/deadlines?${params}`,
      );
      if (res.success && res.data) {
        setListData(res.data);
        setListTotal(res.pagination?.total ?? 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deadlines");
    } finally {
      setLoading(false);
    }
  }, [listPage, clientFilter]);

  useEffect(() => {
    if (view === "calendar") {
      void fetchCalendar();
    } else {
      void fetchList();
    }
  }, [view, fetchCalendar, fetchList]);

  // Navigate months
  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDate(null);
  };

  // ICS export
  const handleExport = () => {
    const params = new URLSearchParams();
    if (clientFilter) params.set("clientId", clientFilter);
    const url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/deadlines/export?${params}`;
    window.open(url, "_blank");
  };

  // Build calendar grid
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const deadlineMap = new Map<string, ExtractedDeadline[]>();

    if (calendarData) {
      for (const entry of calendarData.entries) {
        deadlineMap.set(entry.date, entry.deadlines);
      }
    }

    const cells: Array<{
      day: number | null;
      dateStr: string | null;
      deadlines: ExtractedDeadline[];
      isToday: boolean;
    }> = [];

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      cells.push({ day: null, dateStr: null, deadlines: [], isToday: false });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const cellDate = new Date(year, month - 1, d);
      cellDate.setHours(0, 0, 0, 0);
      cells.push({
        day: d,
        dateStr,
        deadlines: deadlineMap.get(dateStr) ?? [],
        isToday: cellDate.getTime() === today.getTime(),
      });
    }

    return cells;
  }, [calendarData, month, year]);

  // Deadlines for selected date
  const selectedDeadlines = useMemo(() => {
    if (!selectedDate || !calendarData) return [];
    const entry = calendarData.entries.find((e) => e.date === selectedDate);
    return entry?.deadlines ?? [];
  }, [selectedDate, calendarData]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Enhanced Header Section */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5"></div>
        <div className="relative bg-white/80 backdrop-blur-sm border-b border-slate-200/50 px-8 py-6">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/10 rounded-xl blur-lg"></div>
                <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-xl shadow-lg">
                  <CalendarClock className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Compliance Deadlines
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Automatically extracted compliance deadlines from your documents
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* View toggle */}
              <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white/60">
                <button
                  onClick={() => setView("calendar")}
                  className={cn(
                    "px-4 py-2 text-sm flex items-center gap-1.5 transition-all duration-200",
                    view === "calendar"
                      ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-sm"
                      : "bg-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50",
                  )}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Calendar
                </button>
                <button
                  onClick={() => setView("list")}
                  className={cn(
                    "px-4 py-2 text-sm flex items-center gap-1.5 transition-all duration-200 border-l border-slate-200",
                    view === "list"
                      ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-sm"
                      : "bg-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50",
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                  List
                </button>
              </div>

              {/* ICS export */}
              <Button
                onClick={handleExport}
                variant="secondary"
                size="sm"
                className="bg-white/60 hover:bg-white/80 border-slate-200 hover:border-slate-300 transition-all duration-200"
              >
                <Download className="h-3.5 w-3.5" />
                Export ICS
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Client filter */}
      <div className="px-8 py-4 bg-white/50 border-b border-slate-200/50">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label
            htmlFor="client-filter"
            className="text-sm font-medium text-slate-700 shrink-0"
          >
            Filter by client:
          </label>
          <select
            id="client-filter"
            value={clientFilter}
            onChange={(e) => {
              setClientFilter(e.target.value);
              setSelectedDate(null);
            }}
            className="border border-slate-200 bg-white/80 rounded-xl px-4 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 hover:border-slate-300 transition-all duration-200 min-w-[200px]"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {clientFilter && (
            <span className="text-xs text-slate-600">
              {listData.length} deadline{listData.length !== 1 ? "s" : ""} found
            </span>
          )}
        </div>
      </div>

      {error && (
        <Card>
          <CardContent>
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar px-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Spinner size="md" />
            <span className="text-sm text-slate-600">Loading deadlines…</span>
          </div>
        ) : view === "calendar" ? (
          /* ─── Calendar View ─── */
          <div className="flex flex-col lg:flex-row gap-6 py-6">
            <div className="flex-1">
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg">
              <div className="px-6 py-4 border-b border-slate-200/50">
                <div className="flex items-center justify-between">
                  <Button onClick={prevMonth} variant="ghost" size="sm" className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100">
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <h3 className="text-lg font-semibold text-slate-800">
                    {MONTH_NAMES[month - 1]} {year}
                  </h3>
                  <Button onClick={nextMonth} variant="ghost" size="sm" className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100">
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <div className="px-3 sm:px-6 py-4">
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-px mb-1">
                  {DAY_NAMES.map((d) => (
                    <div
                      key={d}
                      className="text-center text-xs font-medium text-slate-600 py-2"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar cells */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarGrid.map((cell, i) => (
                    <button
                      key={i}
                      disabled={!cell.day}
                      onClick={() => cell.dateStr && setSelectedDate(cell.dateStr)}
                      className={cn(
                        "relative h-20 p-2 rounded-lg text-left transition-all duration-200 border border-transparent",
                        cell.day
                          ? "hover:bg-surface-tertiary hover:border-border-light"
                          : "cursor-default",
                        cell.isToday && "ring-2 ring-primary-500 bg-primary-50",
                        selectedDate === cell.dateStr &&
                          "bg-surface-tertiary border-border",
                      )}
                    >
                      {cell.day && (
                        <>
                          <span
                            className={cn(
                              "text-sm font-medium",
                              cell.isToday
                                ? "text-primary-600"
                                : selectedDate === cell.dateStr
                                  ? "text-gray-900"
                                  : "text-gray-700",
                            )}
                          >
                            {cell.day}
                          </span>
                          {cell.deadlines.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {cell.deadlines.slice(0, 3).map((dl) => (
                                <div
                                  key={dl.id}
                                  className={cn(
                                    "w-full h-1.5 rounded-full transition-opacity hover:opacity-80",
                                    getDeadlineColour(
                                      typeof dl.date === "string"
                                        ? dl.date
                                        : new Date(dl.date).toISOString(),
                                    ),
                                  )}
                                />
                              ))}
                              {cell.deadlines.length > 3 && (
                                <span className="text-[10px] text-muted font-medium">
                                  +{cell.deadlines.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </button>
                  ))}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-200/50">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    Past due
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    Next 7 days
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    Future
                  </div>
                </div>
              </div>
            </div>
            </div>

          {/* Side panel */}
          <div className="w-full lg:w-80 shrink-0">
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg">
              <div className="px-6 py-4 border-b border-slate-200/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-800">
                    {selectedDate ? (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-500" />
                        {fmtDate(selectedDate)}
                      </div>
                    ) : (
                      "Select a date"
                    )}
                  </h3>
                  {selectedDate && (
                    <Button
                      onClick={() => setSelectedDate(null)}
                      variant="ghost"
                      size="sm"
                      className="text-slate-600 hover:text-slate-800 p-1 h-auto"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="p-6">
                {!selectedDate ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                    <p className="text-sm text-slate-600">
                      Click a date on the calendar to view deadlines
                    </p>
                  </div>
                ) : selectedDeadlines.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <p className="text-sm text-slate-600">No deadlines on this date</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-600 font-medium uppercase tracking-wider">
                      {selectedDeadlines.length} deadline
                      {selectedDeadlines.length !== 1 ? "s" : ""}
                    </p>
                    {selectedDeadlines.map((dl) => (
                      <DeadlineCard key={dl.id} deadline={dl} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        ) : (
          /* ─── List View ─── */
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg my-6">
            {listData.length === 0 ? (
              <EmptyState
                icon={<CheckCircle className="h-8 w-8 text-green-500" />}
                title="No deadlines found"
                description="No compliance deadlines have been extracted yet. Deadlines are automatically detected when documents are synced."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200/50 bg-slate-50/50">
                        <th className="text-left py-4 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          Date
                        </th>
                        <th className="text-left py-4 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          Description
                        </th>
                        <th className="text-left py-4 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          Client
                        </th>
                        <th className="text-left py-4 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          Source
                        </th>
                        <th className="text-left py-4 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          Confidence
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/30">
                      {listData.map((dl) => {
                        const dateStr =
                          typeof dl.date === "string"
                            ? dl.date
                            : new Date(dl.date).toISOString();
                        return (
                          <tr
                            key={dl.id}
                            className="hover:bg-slate-50/30 transition-colors duration-200"
                          >
                            <td
                              className={cn(
                                "py-4 px-4 font-medium",
                                getDeadlineTextColour(dateStr),
                              )}
                            >
                              {fmtDate(dateStr)}
                            </td>
                            <td className="py-4 px-4 text-slate-800">{dl.description}</td>
                            <td className="py-4 px-4 text-slate-600">
                              {dl.client?.name ?? "—"}
                            </td>
                            <td className="py-4 px-4 text-slate-600">
                              <div className="flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                <span className="truncate max-w-[200px]">
                                  {dl.document?.filename ?? "—"}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              {getConfidenceBadge(dl.confidence)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {listTotal > 50 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-light">
                    <span className="text-xs text-muted">
                      Showing {(listPage - 1) * 50 + 1}–
                      {Math.min(listPage * 50, listTotal)} of {listTotal}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        disabled={listPage === 1}
                        onClick={() => setListPage((p) => p - 1)}
                        variant="secondary"
                        size="sm"
                      >
                        Previous
                      </Button>
                      <Button
                        disabled={listPage * 50 >= listTotal}
                        onClick={() => setListPage((p) => p + 1)}
                        variant="secondary"
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Deadline detail card ────────────────────────────

function DeadlineCard({ deadline }: { deadline: ExtractedDeadline }) {
  const dateStr =
    typeof deadline.date === "string"
      ? deadline.date
      : new Date(deadline.date).toISOString();

  return (
    <div className="p-3.5 rounded-lg border border-border hover:bg-surface-tertiary/50 transition-colors space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-relaxed">
            {deadline.description}
          </p>
          <div
            className={cn(
              "flex items-center gap-1.5 mt-1.5 text-xs font-medium",
              getDeadlineTextColour(dateStr),
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {fmtDate(dateStr)}
          </div>
        </div>
        <div className="shrink-0">{getConfidenceBadge(deadline.confidence)}</div>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-border-light">
        {deadline.client && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0"></span>
            <span>Client: {deadline.client.name}</span>
          </div>
        )}

        {deadline.document && (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{deadline.document.filename}</span>
          </div>
        )}
      </div>
    </div>
  );
}
