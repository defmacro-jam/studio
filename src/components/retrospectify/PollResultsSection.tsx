

"use client"

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList } from "recharts";
import type { PollResponse } from "@/lib/types"; // Import User type removed as it's implicitly handled via PollResponse
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react"; // Removed ChevronDown as it's handled by AccordionTrigger
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"; // Import Accordion components

interface PollResultsSectionProps {
  responses: PollResponse[];
  onEdit?: () => void; // Optional callback to trigger editing
  currentUserHasVoted?: boolean; // Flag to know if the current user has voted
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


export function PollResultsSection({ responses, onEdit, currentUserHasVoted }: PollResultsSectionProps) {
    const totalResponses = responses.length;

    const ratingData = useMemo(() => {
        const dataMap: { [key: number]: { count: number; voters: { name: string, avatarUrl: string }[] } } = {
            1: { count: 0, voters: [] },
            2: { count: 0, voters: [] },
            3: { count: 0, voters: [] },
            4: { count: 0, voters: [] },
            5: { count: 0, voters: [] },
        };

        responses.forEach(response => {
            if (response.rating >= 1 && response.rating <= 5) {
                const ratingKey = response.rating as keyof typeof dataMap;
                dataMap[ratingKey].count++;
                dataMap[ratingKey].voters.push({ name: response.author.name, avatarUrl: response.author.avatarUrl });
            }
        });
        return dataMap;
    }, [responses]);

    const chartData = useMemo(() => {
        return [
            { rating: "1 ★", count: ratingData[1].count, voters: ratingData[1].voters, fill: "var(--color-1)" },
            { rating: "2 ★", count: ratingData[2].count, voters: ratingData[2].voters, fill: "var(--color-2)" },
            { rating: "3 ★", count: ratingData[3].count, voters: ratingData[3].voters, fill: "var(--color-3)" },
            { rating: "4 ★", count: ratingData[4].count, voters: ratingData[4].voters, fill: "var(--color-4)" },
            { rating: "5 ★", count: ratingData[5].count, voters: ratingData[5].voters, fill: "var(--color-5)" },
        ];
    }, [ratingData]);

     // Calculate average rating, handling the case of no responses
    const averageRating = useMemo(() => {
        if (totalResponses === 0) {
            return 0;
        }
        const sum = responses.reduce((acc, curr) => acc + curr.rating, 0);
        return (sum / totalResponses);
    }, [responses, totalResponses]);

    return (
         // Wrap the Card with Accordion - Removed defaultValue to make it closed by default
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="poll-results" className="border-b-0"> {/* Remove bottom border from item */}
                 <Card className="shadow-lg border-border/80 rounded-lg bg-card">
                     {/* Use CardHeader for padding and structure, and flexbox for layout */}
                     <CardHeader className="pb-4 pt-4 px-6 flex flex-row justify-between items-center w-full">
                         {/* Wrapper div for the trigger content */}
                         <div className="flex-grow">
                             <AccordionTrigger className="p-0 hover:no-underline flex w-full"> {/* Removed flex-grow from trigger */}
                                 <div className="flex items-center space-x-4 text-left"> {/* Ensure text aligns left */}
                                     <div>
                                        <CardTitle className="text-xl font-bold text-primary">Weekly Sentiment</CardTitle>
                                        <CardDescription className="text-sm">
                                            {totalResponses > 0
                                                ? `Avg: ${averageRating.toFixed(1)} ★ (${totalResponses} vote${totalResponses !== 1 ? 's' : ''})`
                                                : `No responses yet.`
                                            }
                                        </CardDescription>
                                     </div>
                                     {/* Chevron is automatically added by AccordionTrigger */}
                                 </div>
                             </AccordionTrigger>
                         </div>
                         {/* Edit Button is a sibling to the trigger's wrapper */}
                         {/* Conditionally render Edit button only if the user has voted */}
                         {currentUserHasVoted && onEdit && (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="ml-4 flex-shrink-0"> {/* Added ml-4 for spacing */}
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Vote
                            </Button>
                        )}
                     </CardHeader>
                     {/* AccordionContent wraps the chart */}
                     <AccordionContent className="pt-0"> {/* Remove top padding */}
                         <CardContent className="py-2 px-6"> {/* Maintain padding */}
                             {totalResponses > 0 ? (
                                <ChartContainer config={chartConfig} className="h-[180px] w-full"> {/* Maintain height */}
                                     <BarChart
                                        data={chartData}
                                        layout="horizontal" // Changed layout to horizontal (default)
                                        margin={{
                                            top: 5,
                                            right: 10, // Reduced right margin
                                            left: 5, // Adjusted left margin
                                            bottom: 5, // Adjusted bottom margin
                                        }}
                                        barCategoryGap="20%" // Adjusted gap
                                     >
                                         <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                                         {/* XAxis is now the categorical rating axis */}
                                          <XAxis
                                            dataKey="rating"
                                            type="category"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={5}
                                            stroke="hsl(var(--muted-foreground))"
                                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                                         />
                                         {/* YAxis is now the numerical count axis */}
                                         <YAxis
                                            type="number"
                                            dataKey="count"
                                            axisLine={false}
                                            tickLine={false}
                                            tickMargin={5}
                                            allowDecimals={false}
                                            stroke="hsl(var(--muted-foreground))"
                                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                                            domain={[0, 'dataMax + 1']} // Ensure space for labels
                                         />
                                         <ChartTooltip
                                            cursor={{ fill: 'hsl(var(--accent) / 0.1)' }}
                                            content={<ChartTooltipContent indicator="dot" labelClassName="font-medium" showVoters={true} />} // Enable voter display
                                         />
                                        {/* Bar orientation adjusted (radius, barSize) */}
                                        <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={30}> {/* Adjusted radius and barSize */}
                                            {/* LabelList position changed to top */}
                                            <LabelList
                                                dataKey="count"
                                                position="top" // Position labels above the bars
                                                offset={8}
                                                className="fill-foreground font-medium"
                                                fontSize={11} // Slightly smaller font size
                                                formatter={(value: number) => (value > 0 ? value : '')}
                                            />
                                        </Bar>
                                     </BarChart>
                                </ChartContainer>
                             ) : (
                                <div className="h-[180px] flex items-center justify-center">
                                    <p className="text-center text-sm text-muted-foreground py-4">Waiting for votes...</p>
                                </div>
                             )}
                         </CardContent>
                     </AccordionContent>
                 </Card>
            </AccordionItem>
        </Accordion>
    );
}
