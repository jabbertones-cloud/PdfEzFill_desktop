import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import type { FormTemplate } from "@shared/schema";
import { FileText, TrendingUp, CheckCircle2 } from "lucide-react";

interface TemplateStatsProps {
  templates: FormTemplate[];
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function TemplateStats({ templates }: TemplateStatsProps) {
  const stats = useMemo(() => {
    if (!templates || templates.length === 0) {
      return {
        totalTemplates: 0,
        totalMatches: 0,
        averageSuccessRate: 0,
        mostUsedTemplate: null,
        documentTypeData: [],
        successRateData: [],
      };
    }

    // Total templates
    const totalTemplates = templates.length;

    // Total matches and average success rate
    let totalMatches = 0;
    let totalSuccesses = 0;

    templates.forEach((t) => {
      const matches = t.match_success_count + t.match_failure_count;
      totalMatches += matches;
      totalSuccesses += t.match_success_count;
    });

    const averageSuccessRate = totalMatches > 0 ? (totalSuccesses / totalMatches) * 100 : 0;

    // Most used template
    const mostUsedTemplate = templates.length > 0 ? templates[0] : null;

    // Document type distribution
    const docTypeMap: Record<string, number> = {};
    templates.forEach((t) => {
      docTypeMap[t.document_type] = (docTypeMap[t.document_type] || 0) + 1;
    });

    const documentTypeData = Object.entries(docTypeMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Success rate distribution
    const successRateMap: Record<string, number> = {};
    const rateRanges = [
      "0-20%",
      "20-40%",
      "40-60%",
      "60-80%",
      "80-100%",
    ];

    rateRanges.forEach((range) => {
      successRateMap[range] = 0;
    });

    templates.forEach((t) => {
      const total = t.match_success_count + t.match_failure_count;
      if (total > 0) {
        const rate = (t.match_success_count / total) * 100;
        if (rate < 20) successRateMap["0-20%"]++;
        else if (rate < 40) successRateMap["20-40%"]++;
        else if (rate < 60) successRateMap["40-60%"]++;
        else if (rate < 80) successRateMap["60-80%"]++;
        else successRateMap["80-100%"]++;
      }
    });

    const successRateData = Object.entries(successRateMap).map(([range, count]) => ({
      range,
      count,
    }));

    return {
      totalTemplates,
      totalMatches,
      averageSuccessRate,
      mostUsedTemplate,
      documentTypeData,
      successRateData,
    };
  }, [templates]);

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Templates</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTemplates}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Form templates in your library
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Matches</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMatches}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Successful form matches
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.averageSuccessRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Average across all templates
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Document Type Distribution */}
        {stats.documentTypeData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Templates by Type</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.documentTypeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    stroke="var(--muted-foreground)"
                    style={{ fontSize: "12px" }}
                  />
                  <YAxis stroke="var(--muted-foreground)" style={{ fontSize: "12px" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Success Rate Distribution */}
        {stats.successRateData.some((d) => d.count > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Success Rate Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.successRateData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ range, count, percent }) =>
                      count > 0 ? `${range}: ${(percent * 100).toFixed(0)}%` : null
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {stats.successRateData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Most Used Template */}
      {stats.mostUsedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Used Template</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{stats.mostUsedTemplate.document_type}</p>
                  <p className="text-sm text-muted-foreground">
                    {stats.mostUsedTemplate.field_count} fields
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{stats.mostUsedTemplate.usage_count}</p>
                  <p className="text-sm text-muted-foreground">uses</p>
                </div>
              </div>
              {stats.mostUsedTemplate.match_success_count + stats.mostUsedTemplate.match_failure_count > 0 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-muted-foreground">Match Success Rate</p>
                  <p className="font-medium">
                    {(
                      (stats.mostUsedTemplate.match_success_count /
                        (stats.mostUsedTemplate.match_success_count +
                          stats.mostUsedTemplate.match_failure_count)) *
                      100
                    ).toFixed(1)}
                    %
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
