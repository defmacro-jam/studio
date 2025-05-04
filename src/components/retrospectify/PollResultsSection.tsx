
"use client"

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList } from "recharts";
import type { PollResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";

interface PollResultsSectionProps {
  responses: PollResponse[];
  onEdit?: () => void; // Optional callback to trigger editing
}

// Define the chart configuration with specific theme colors
const chartConfig = {
  count: {
    label: "Votes",
  },
  "1": { label: "1 Star", color: "hsl(var(--chart-1))" },
  "2": { label: "2 Stars", color: "hsl(var(--chart-2))" },
  "3": { label: "3 Stars", color: "hsl(var(--chart-3))" },
  "4": { label: "4 Stars", color: "hsl(var(--chart-4))" },
  "5": { label: "5 Stars", color: "hsl(var(--chart-5))" },
} satisfies ChartConfig;


export function PollResultsSection({ responses, onEdit }: PollResultsSectionProps) {
    const totalResponses = responses.length;

    const ratingCounts = useMemo(() => {
        const counts: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        responses.forEach(response => {
            if (response.rating >= 1 && response.rating <= 5) {
                counts[response.rating as keyof typeof counts]++;
            }
        });
        return counts;
    }, [responses]);

    const chartData = useMemo(() => {
        return [
            { rating: "1 ★", count: ratingCounts[1], fill: "var(--color-1)" },
            { rating: "2 ★", count: ratingCounts[2], fill: "var(--color-2)" },
            { rating: "3 ★", count: ratingCounts[3], fill: "var(--color-3)" },
            { rating: "4 ★", count: ratingCounts[4], fill: "var(--color-4)" },
            { rating: "5 ★", count: ratingCounts[5], fill: "var(--color-5)" },
        ];
    }, [ratingCounts]);

     // Calculate average rating, handling the case of no responses
    const averageRating = useMemo(() => {
        if (totalResponses === 0) {
            return 0;
        }
        const sum = responses.reduce((acc, curr) => acc + curr.rating, 0);
        return (sum / totalResponses);
    }, [responses, totalResponses]);

    return (
        <Card className="shadow-lg border-border/80 rounded-lg bg-card">
            <CardHeader className="pb-2 flex flex-row justify-between items-start">
                 <div>
                    <CardTitle className="text-xl font-bold text-primary">Weekly Sentiment Snapshot</CardTitle>
                    <CardDescription className="text-sm">
                        {totalResponses > 0
                            ? `Average Rating: ${averageRating.toFixed(1)} ★ (from ${totalResponses} response${totalResponses !== 1 ? 's' : ''})`
                            : `No responses yet.`
                        }
                    </CardDescription>
                 </div>
                 {/* Add Edit Button if onEdit is provided */}
                {onEdit && (
                    <Button variant="outline" size="sm" onClick={onEdit}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Your Response
                    </Button>
                )}
            </CardHeader>
            <CardContent>
                 {totalResponses > 0 ? (
                    <ChartContainer config={chartConfig} className="h-[250px] w-full">
                         <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{
                                top: 10,
                                right: 40, // Increased right margin for labels
                                left: 10,
                                bottom: 10,
                            }}
                            barCategoryGap="20%"
                         >
                            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                             <XAxis
                                type="number"
                                dataKey="count"
                                axisLine={false}
                                tickLine={false}
                                tickMargin={10}
                                allowDecimals={false}
                                stroke="hsl(var(--muted-foreground))" // Axis stroke color
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} // Tick label style
                             />
                             <YAxis
                                dataKey="rating"
                                type="category"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={10}
                                width={60}
                                stroke="hsl(var(--muted-foreground))" // Axis stroke color
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} // Tick label style
                             />
                             <ChartTooltip
                                cursor={{ fill: 'hsl(var(--accent) / 0.1)' }} // Lighter hover effect
                                content={<ChartTooltipContent indicator="dot" labelClassName="font-medium" />} // Use dot indicator
                             />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={25}>
                                <LabelList
                                    dataKey="count"
                                    position="right" // Position labels to the right
                                    offset={8}
                                    className="fill-foreground font-medium"
                                    fontSize={12}
                                    formatter={(value: number) => (value > 0 ? value : '')} // Only show label if count > 0
                                />
                            </Bar>
                         </BarChart>
                    </ChartContainer>
                 ) : (
                    <div className="h-[250px] flex items-center justify-center">
                        <p className="text-center text-muted-foreground py-4">Waiting for poll responses...</p>
                    </div>
                 )}
            </CardContent>
            {/* Remove CardFooter unless needed for other actions */}
        </Card>
    );
}
