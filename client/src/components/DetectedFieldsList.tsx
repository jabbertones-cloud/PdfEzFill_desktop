import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Type,
  CheckSquare,
  Calendar,
  Mail,
  Phone,
  Hash,
  FileSignature,
  AlignLeft,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { DetectionConfidenceBar } from "@/components/DetectionConfidenceBar";
import type { FormField } from "@shared/schema";

interface DetectedFieldsListProps {
  fields: FormField[];
  onVerify: (fieldId: string) => void;
  onReject: (fieldId: string) => void;
  isLoading?: boolean;
}

type SortKey = "confidence" | "type" | "page" | "label";
type SortDirection = "asc" | "desc";

const FIELD_TYPE_ICONS: Record<string, typeof Type> = {
  text: Type,
  textarea: AlignLeft,
  checkbox: CheckSquare,
  date: Calendar,
  email: Mail,
  phone: Phone,
  number: Hash,
  signature: FileSignature,
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  textarea: "Text Area",
  checkbox: "Checkbox",
  date: "Date",
  email: "Email",
  phone: "Phone",
  number: "Number",
  signature: "Signature",
  radio: "Radio",
  table: "Table",
};

export function DetectedFieldsList({
  fields,
  onVerify,
  onReject,
  isLoading = false,
}: DetectedFieldsListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("confidence");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  // Get unique field types
  const fieldTypes = useMemo(() => {
    return Array.from(new Set(fields.map((f) => f.type))).sort();
  }, [fields]);

  // Filter and sort fields
  const processedFields = useMemo(() => {
    let filtered = fields;

    // Apply type filter
    if (filterType !== "all") {
      filtered = filtered.filter((f) => f.type === filterType);
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortKey) {
        case "confidence":
          aVal = a.confidence ?? 0;
          bVal = b.confidence ?? 0;
          break;
        case "type":
          aVal = a.type;
          bVal = b.type;
          break;
        case "page":
          aVal = a.page;
          bVal = b.page;
          break;
        case "label":
          aVal = a.label.toLowerCase();
          bVal = b.label.toLowerCase();
          break;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [fields, sortKey, sortDirection, filterType]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const handleSelectAll = () => {
    if (selectedFields.size === processedFields.length) {
      setSelectedFields(new Set());
    } else {
      setSelectedFields(new Set(processedFields.map((f) => f.id)));
    }
  };

  const handleSelectField = (fieldId: string) => {
    const newSelection = new Set(selectedFields);
    if (newSelection.has(fieldId)) {
      newSelection.delete(fieldId);
    } else {
      newSelection.add(fieldId);
    }
    setSelectedFields(newSelection);
  };

  const handleVerifySelected = () => {
    selectedFields.forEach((fieldId) => onVerify(fieldId));
    setSelectedFields(new Set());
  };

  const handleRejectSelected = () => {
    selectedFields.forEach((fieldId) => onReject(fieldId));
    setSelectedFields(new Set());
  };

  const SortHeader = ({
    children,
    sortKey: key,
  }: {
    children: React.ReactNode;
    sortKey: SortKey;
  }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50"
      onClick={() => handleSort(key)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortKey === key && (
          sortDirection === "asc" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )
        )}
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {fieldTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {FIELD_TYPE_LABELS[type] || type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Bulk actions */}
        {selectedFields.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedFields.size} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleVerifySelected}
              disabled={isLoading}
            >
              Verify All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRejectSelected}
              disabled={isLoading}
            >
              Reject All
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-12">
                <input
                  type="checkbox"
                  checked={
                    processedFields.length > 0 &&
                    selectedFields.size === processedFields.length
                  }
                  onChange={handleSelectAll}
                  className="h-4 w-4 cursor-pointer"
                  disabled={isLoading}
                />
              </TableHead>
              <TableHead className="w-12">Type</TableHead>
              <SortHeader sortKey="label">Label</SortHeader>
              <SortHeader sortKey="confidence">Confidence</SortHeader>
              <SortHeader sortKey="page">Page</SortHeader>
              <TableHead className="w-24">Position</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedFields.length > 0 ? (
              processedFields.map((field) => {
                const Icon = FIELD_TYPE_ICONS[field.type] || Type;
                const isSelected = selectedFields.has(field.id);

                return (
                  <TableRow
                    key={field.id}
                    className={isSelected ? "bg-blue-50 dark:bg-blue-950/20" : ""}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectField(field.id)}
                        className="h-4 w-4 cursor-pointer"
                        disabled={isLoading}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="truncate max-w-[150px]">
                        <p className="text-sm font-medium truncate">
                          {field.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {FIELD_TYPE_LABELS[field.type] || field.type}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {field.confidence !== undefined ? (
                        <DetectionConfidenceBar
                          confidence={field.confidence}
                          showLabel={true}
                          size="sm"
                        />
                      ) : (
                        <Badge variant="secondary">Manual</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">
                        Page {field.page}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">
                          {Math.round(field.bbox[0])}%,{Math.round(field.bbox[1])}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onVerify(field.id)}
                          disabled={isLoading}
                          className="h-7 px-2 text-xs"
                        >
                          Verify
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onReject(field.id)}
                          disabled={isLoading}
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <p className="text-muted-foreground">
                    {fields.length === 0
                      ? "No fields detected yet"
                      : "No fields match the current filter"}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Info text */}
      <p className="text-xs text-muted-foreground">
        Showing {processedFields.length} of {fields.length} detected fields
      </p>
    </div>
  );
}
