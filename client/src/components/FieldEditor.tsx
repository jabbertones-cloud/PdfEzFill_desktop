import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, GripVertical } from "lucide-react";
import type { FormField, FieldOverride } from "@shared/schema";

interface FieldEditorProps {
  fields: FormField[];
  onAddField: (override: FieldOverride) => void;
  onEditField: (override: FieldOverride) => void;
  onDeleteField: (override: FieldOverride) => void;
  currentPage: number;
  disabled?: boolean;
}

const fieldTypes: FormField["type"][] = [
  "text",
  "number",
  "date",
  "email",
  "phone",
  "checkbox",
  "radio",
  "textarea",
  "signature",
  "table",
];

const fieldTypeLabels: Record<FormField["type"], string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  email: "Email",
  phone: "Phone",
  checkbox: "Checkbox",
  radio: "Radio",
  textarea: "Text Area",
  signature: "Signature",
  table: "Table",
};

export function FieldEditor({
  fields,
  onAddField,
  onEditField,
  onDeleteField,
  currentPage,
  disabled = false,
}: FieldEditorProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<FormField | null>(null);
  const [newField, setNewField] = useState<Partial<FormField>>({
    label: "",
    type: "text",
    required: false,
  });

  const pageFields = fields.filter((f) => f.page === currentPage);

  const handleAddField = () => {
    const field: FormField = {
      id: `manual_${Date.now()}`,
      label: newField.label || "New Field",
      type: newField.type || "text",
      page: currentPage,
      bbox: [50, 100 + pageFields.length * 80, 300, 30],
      required: newField.required || false,
      isManuallyAdded: true,
      confidence: 100,
    };

    onAddField({
      fieldId: field.id,
      action: "add",
      modifiedField: field,
      timestamp: new Date().toISOString(),
    });

    setAddDialogOpen(false);
    setNewField({ label: "", type: "text", required: false });
  };

  const handleEditField = () => {
    if (!selectedField) return;

    const modifiedField: FormField = {
      ...selectedField,
      label: newField.label || selectedField.label,
      type: newField.type || selectedField.type,
      required: newField.required ?? selectedField.required,
      isEdited: true,
    };

    onEditField({
      fieldId: selectedField.id,
      action: "edit",
      originalField: selectedField,
      modifiedField,
      timestamp: new Date().toISOString(),
    });

    setEditDialogOpen(false);
    setSelectedField(null);
    setNewField({ label: "", type: "text", required: false });
  };

  const handleDeleteField = () => {
    if (!selectedField) return;

    onDeleteField({
      fieldId: selectedField.id,
      action: "delete",
      originalField: selectedField,
      timestamp: new Date().toISOString(),
    });

    setDeleteDialogOpen(false);
    setSelectedField(null);
  };

  const openEditDialog = (field: FormField) => {
    setSelectedField(field);
    setNewField({
      label: field.label,
      type: field.type,
      required: field.required,
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (field: FormField) => {
    setSelectedField(field);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Fields on Page {currentPage}</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddDialogOpen(true)}
          disabled={disabled}
          data-testid="button-add-field"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Field
        </Button>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {pageFields.map((field) => (
          <Card
            key={field.id}
            className={`${field.isManuallyAdded ? "border-primary/50" : ""} ${
              field.isEdited ? "border-yellow-500/50" : ""
            }`}
          >
            <CardContent className="p-3 flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{field.label}</span>
                  {field.required && (
                    <Badge variant="destructive" className="text-xs">
                      Required
                    </Badge>
                  )}
                  {field.isManuallyAdded && (
                    <Badge variant="secondary" className="text-xs">
                      Manual
                    </Badge>
                  )}
                  {field.isEdited && (
                    <Badge variant="outline" className="text-xs">
                      Edited
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{fieldTypeLabels[field.type]}</span>
                  {field.confidence && (
                    <span
                      className={
                        field.confidence > 70
                          ? "text-green-600"
                          : field.confidence > 30
                          ? "text-yellow-600"
                          : "text-red-600"
                      }
                    >
                      {Math.round(field.confidence)}% confidence
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => openEditDialog(field)}
                  disabled={disabled}
                  data-testid={`button-edit-field-${field.id}`}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => openDeleteDialog(field)}
                  disabled={disabled}
                  data-testid={`button-delete-field-${field.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {pageFields.length === 0 && (
          <p className="text-center text-muted-foreground py-4">
            No fields on this page. Click "Add Field" to create one.
          </p>
        )}
      </div>

      {/* Add Field Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Field</DialogTitle>
            <DialogDescription>
              Add a custom field to page {currentPage}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="label">Field Label</Label>
              <Input
                id="label"
                value={newField.label}
                onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                placeholder="Enter field label..."
                data-testid="input-field-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Field Type</Label>
              <Select
                value={newField.type}
                onValueChange={(value) =>
                  setNewField({ ...newField, type: value as FormField["type"] })
                }
              >
                <SelectTrigger data-testid="select-field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {fieldTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="required"
                checked={newField.required}
                onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                className="h-4 w-4"
                data-testid="checkbox-field-required"
              />
              <Label htmlFor="required">Required field</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddField} data-testid="button-confirm-add-field">
              Add Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Field Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Field</DialogTitle>
            <DialogDescription>Modify the field properties</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-label">Field Label</Label>
              <Input
                id="edit-label"
                value={newField.label}
                onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                data-testid="input-edit-field-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Field Type</Label>
              <Select
                value={newField.type}
                onValueChange={(value) =>
                  setNewField({ ...newField, type: value as FormField["type"] })
                }
              >
                <SelectTrigger data-testid="select-edit-field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {fieldTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit-required"
                checked={newField.required}
                onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                className="h-4 w-4"
                data-testid="checkbox-edit-field-required"
              />
              <Label htmlFor="edit-required">Required field</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditField} data-testid="button-confirm-edit-field">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Field</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedField?.label}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteField}
              data-testid="button-confirm-delete-field"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
