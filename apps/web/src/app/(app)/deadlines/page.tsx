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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Compliance Deadlines</h1>
          <p className="mt-1 text-sm text-muted">
            Automatically extracted compliance deadlines from your documents
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setView("calendar")}
              className={cn(
                "px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors",
                view === "calendar"
                  ? "bg-primary-600 text-white"
                  : "bg-white text-muted hover:text-gray-700 hover:bg-surface-tertiary",
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              Calendar
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors border-l border-border",
                view === "list"
                  ? "bg-primary-600 text-white"
                  : "bg-white text-muted hover:text-gray-700 hover:bg-surface-tertiary",
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
            className="flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export ICS
          </Button>
        </div>
      </div>

      {/* Client filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label
          htmlFor="client-filter"
          className="text-sm font-medium text-gray-700 shrink-0"
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
          className="border border-border bg-white rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 hover:border-border-heavy transition-colors min-w-[200px]"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {clientFilter && (
          <span className="text-xs text-muted">
            {listData.length} deadline{listData.length !== 1 ? "s" : ""} found
          </span>
        )}
      </div>

      {error && (
        <Card>
          <CardContent>
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Spinner size="md" />
              <span className="text-sm text-muted">Loading deadlines…</span>
            </div>
          </CardContent>
        </Card>
      ) : view === "calendar" ? (
        /* ─── Calendar View ─── */
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Button onClick={prevMonth} variant="ghost" size="sm" className="p-2">
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <CardTitle className="text-base font-semibold">
                    {MONTH_NAMES[month - 1]} {year}
                  </CardTitle>
                  <Button onClick={nextMonth} variant="ghost" size="sm" className="p-2">
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-px mb-1">
                  {DAY_NAMES.map((d) => (
                    <div
                      key={d}
                      className="text-center text-xs font-medium text-muted py-2"
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
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border-light">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    Past due
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    Next 7 days
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    Future
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Side panel */}
          <div className="w-full lg:w-80 shrink-0">
            <Card className="h-fit">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {selectedDate ? (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary-500" />
                        {fmtDate(selectedDate)}
                      </div>
                    ) : (
                      "Select a date"
                    )}
                  </CardTitle>
                  {selectedDate && (
                    <Button
                      onClick={() => setSelectedDate(null)}
                      variant="ghost"
                      size="sm"
                      className="text-muted hover:text-gray-700 p-1 h-auto"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedDate ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-border-heavy mx-auto mb-3" />
                    <p className="text-sm text-muted">
                      Click a date on the calendar to view deadlines
                    </p>
                  </div>
                ) : selectedDeadlines.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <p className="text-sm text-muted">No deadlines on this date</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted font-medium uppercase tracking-wider">
                      {selectedDeadlines.length} deadline
                      {selectedDeadlines.length !== 1 ? "s" : ""}
                    </p>
                    {selectedDeadlines.map((dl) => (
                      <DeadlineCard key={dl.id} deadline={dl} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* ─── List View ─── */
        <Card>
          <CardContent>
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
                    <thead className="bg-surface-tertiary">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">
                          Date
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">
                          Description
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">
                          Client
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">
                          Source
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">
                          Confidence
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {listData.map((dl) => {
                        const dateStr =
                          typeof dl.date === "string"
                            ? dl.date
                            : new Date(dl.date).toISOString();
                        return (
                          <tr
                            key={dl.id}
                            className="hover:bg-surface-tertiary/50 transition-colors"
                          >
                            <td
                              className={cn(
                                "py-3 px-4 font-medium",
                                getDeadlineTextColour(dateStr),
                              )}
                            >
                              {fmtDate(dateStr)}
                            </td>
                            <td className="py-3 px-4 text-gray-900">{dl.description}</td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {dl.client?.name ?? "—"}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-muted shrink-0" />
                                <span className="truncate max-w-[200px]">
                                  {dl.document?.filename ?? "—"}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
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
          </CardContent>
        </Card>
      )}
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
