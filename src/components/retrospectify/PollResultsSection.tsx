"use client"

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList } from "recharts";
import type { PollResponse } from "@/lib/types";
import { ChartConfig } from "@/components/ui/chart"; // Import ChartConfig type


interface PollResultsSectionProps {
  responses: PollResponse[];
}

// Define the chart configuration
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
            { rating: 1, count: ratingCounts[1], fill: "var(--color-1)" },
            { rating: 2, count: ratingCounts[2], fill: "var(--color-2)" },
            { rating: 3, count: ratingCounts[3], fill: "var(--color-3)" },
            { rating: 4, count: ratingCounts[4], fill: "var(--color-4)" },
            { rating: 5, count: ratingCounts[5], fill: "var(--color-5)" },
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
        <Card className="shadow-md">
            <CardHeader>
                <CardTitle className="text-lg font-semibold">Weekly Sentiment Results</CardTitle>
                 <CardDescription>
                    Based on {totalResponses} response{totalResponses !== 1 ? 's' : ''}.
                    {totalResponses > 0 && ` Average Rating: ${averageRating.toFixed(1)} stars.`}
                </CardDescription>
            </CardHeader>
            <CardContent>
                 {totalResponses > 0 ? (
                    <ChartContainer config={chartConfig} className="h-[200px] w-full">
                         <BarChart
                            accessibilityLayer // Improves accessibility
                            data={chartData}
                            margin={{
                                top: 20, // Add space for labels
                                right: 10,
                                left: 0,
                                bottom: 5,
                            }}
                         >
                            <CartesianGrid vertical={false} strokeDasharray="3 3" />
                             <XAxis
                                dataKey="rating"
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                                tickFormatter={(value) => `${value} ★`} // Add star symbol
                             />
                             <YAxis
                                allowDecimals={false} // Ensure integer ticks for counts
                                tickMargin={10}
                                axisLine={false}
                                tickLine={false}
                             />
                             <ChartTooltip
                                cursor={false} // Disable cursor line on hover
                                content={<ChartTooltipContent indicator="line" />}
                             />
                            <Bar dataKey="count" radius={4}>
                                <LabelList
                                    position="top"
                                    offset={8} // Adjust offset as needed
                                    className="fill-foreground"
                                    fontSize={12}
                                    formatter={(value: number) => (value > 0 ? value : '')} // Only show label if count > 0
                                />
                            </Bar>
                         </BarChart>
                    </ChartContainer>
                 ) : (
                    <p className="text-center text-muted-foreground py-4">No poll responses submitted yet.</p>
                 )}
            </CardContent>
        </Card>
    );
}
