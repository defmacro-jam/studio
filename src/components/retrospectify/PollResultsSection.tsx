"use client"

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList, Tooltip } from "recharts";
import type { PollResponse } from "@/lib/types";

interface PollResultsSectionProps {
  responses: PollResponse[];
}

// Define the chart configuration with specific theme colors
const chartConfig = {
  count: {
    label: "Votes",
  },
  "1": { label: "1 Star", color: "hsl(var(--chart-1))" }, // Use chart colors from theme
  "2": { label: "2 Stars", color: "hsl(var(--chart-2))" },
  "3": { label: "3 Stars", color: "hsl(var(--chart-3))" },
  "4": { label: "4 Stars", color: "hsl(var(--chart-4))" },
  "5": { label: "5 Stars", color: "hsl(var(--chart-5))" },
} satisfies ChartConfig;


export function PollResultsSection({ responses }: PollResultsSectionProps) {
    const totalResponses = responses.length;

    const ratingCounts = useMemo(() => {
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
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
            return 0; // Or return null or undefined, depending on how you want to display it
        }
        const sum = responses.reduce((acc, curr) => acc + curr.rating, 0);
        return (sum / totalResponses);
    }, [responses, totalResponses]);

    return (
        <Card className="shadow-lg border-border/80 rounded-lg">
            <CardHeader className="pb-2">
                <CardTitle className="text-xl font-bold text-primary">Weekly Sentiment Snapshot</CardTitle>
                 <CardDescription className="text-sm">
                    {totalResponses > 0
                        ? `Average Rating: ${averageRating.toFixed(1)} ★ (from ${totalResponses} response${totalResponses !== 1 ? 's' : ''})`
                        : `No responses yet.`
                    }
                </CardDescription>
            </CardHeader>
            <CardContent>
                 {totalResponses > 0 ? (
                    <ChartContainer config={chartConfig} className="h-[250px] w-full">
                         <BarChart
                            data={chartData}
                            layout="vertical" // Change to vertical layout
                            margin={{
                                top: 10,
                                right: 30, // More space for labels on the right
                                left: 10,
                                bottom: 10,
                            }}
                            barCategoryGap="20%" // Add gap between bars
                         >
                            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                             <XAxis
                                type="number"
                                dataKey="count"
                                axisLine={false}
                                tickLine={false}
                                tickMargin={10}
                                allowDecimals={false} // Ensure integer ticks
                             />
                             <YAxis
                                dataKey="rating"
                                type="category" // Use category type for y-axis
                                tickLine={false}
                                axisLine={false}
                                tickMargin={10}
                                width={60} // Adjust width for labels if needed
                             />
                             <Tooltip
                                cursor={{ fill: 'hsl(var(--accent) / 0.2)' }} // Lighter hover effect
                                content={<ChartTooltipContent indicator="line" />}
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
        </Card>
    );
}
