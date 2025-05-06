
'use server';
/**
 * @fileOverview Generates a retrospective report and suggests the next scrum master.
 *
 * - generateRetroReport - A function to generate the report and suggest next scrum master.
 * - GenerateRetroReportInput - The input type for the function.
 * - GenerateRetroReportOutput - The return type for the function.
 */

import { ai } from '@/ai/ai-instance';
import type { PollResponse as ExternalPollResponse, RetroItem as ExternalRetroItem, User as ExternalUser } from '@/lib/types'; // Use original types for the public interface
import { z } from 'genkit';

// Define input schemas based on external types for the flow's public interface
const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().describe("The user's email address."),
    avatarUrl: z.string().describe("URL of the user's avatar."),
    role: z.string(), // AppRole is a string enum, z.string() is fine.
    teamIds: z.array(z.string()).optional(),
});
export type UserType = z.infer<typeof UserSchema>;


const PollResponseSchema = z.object({
    id: z.string(),
    author: UserSchema,
    rating: z.number(),
    justification: z.string(),
    timestamp: z.union([z.date(), z.object({})]), // Firestore Timestamps can be complex
});

const RetroItemSchema = z.object({
    id: z.string(),
    author: UserSchema,
    content: z.string(),
    timestamp: z.union([z.date(), z.object({})]),
    replies: z.array(z.lazy(() => RetroItemSchema)).optional(),
    category: z.enum(['well', 'improve', 'discuss', 'action']),
    isFromPoll: z.boolean().optional(),
    pollResponseId: z.string().optional(),
});

// This is the schema for the public generateRetroReport function and the flow's input
const GenerateRetroReportInputSchema = ai.defineSchema('GenerateRetroReportInput', z.object({
    teamId: z.string().describe("The ID of the team."),
    teamName: z.string().describe("The name of the team."),
    pollResponses: z.array(PollResponseSchema).describe("An array of poll responses from the retrospective."),
    retroItems: z.array(RetroItemSchema).describe("An array of all retro items (well, improve, discuss, action)."), // All items together
    currentScrumMaster: UserSchema.nullable().optional().describe("The current scrum master, if any."),
}));
export type GenerateRetroReportInput = z.infer<typeof GenerateRetroReportInputSchema>;


// Internal schema for the prompt, with pre-filtered items AND the determined next scrum master
const RetroReportPromptInputSchema = ai.defineSchema('RetroReportPromptInput', z.object({
    teamId: z.string().describe("The ID of the team."),
    teamName: z.string().describe("The name of the team."),
    pollResponses: z.array(PollResponseSchema).describe("An array of poll responses from the retrospective."),
    currentScrumMaster: UserSchema.nullable().optional().describe("The current scrum master, if any."),
    nextScrumMaster: UserSchema.nullable().optional().describe("The determined next scrum master for the team."), // Added nextScrumMaster
    wellItems: z.array(RetroItemSchema).describe("Items categorized as 'What Went Well'."),
    improveItems: z.array(RetroItemSchema).describe("Items categorized as 'What Could Be Improved'."),
    discussItems: z.array(RetroItemSchema).describe("Items categorized as 'Discussion Topics'."),
    actionItems: z.array(RetroItemSchema).describe("Items categorized as 'Action Items'."),
    currentDate: z.string().describe("The current date for the report header."),
}));

// Output schema for the *flow* (public interface)
const GenerateRetroReportOutputSchema = ai.defineSchema('GenerateRetroReportOutput', z.object({
    reportSummaryHtml: z.string().describe("A concise HTML summary of the retrospective, suitable for an email. Include sections for Sentiment Analysis (average rating, key themes from justifications), What Went Well, What Could Be Improved, Discussion Points, Action Items, and the Next Scrum Master. Keep it well-formatted and readable."),
    nextScrumMaster: UserSchema.nullable().optional().describe("The suggested next scrum master from the team members (excluding current scrum master, if provided). If no other members, can be null."),
}));
export type GenerateRetroReportOutput = z.infer<typeof GenerateRetroReportOutputSchema>;

// Simplified output schema for the *prompt* - it only needs to generate the HTML.
const PromptOutputSchema = ai.defineSchema('PromptOutput', z.object({
    reportSummaryHtml: z.string().describe("A concise HTML summary of the retrospective, suitable for an email. Include sections for Sentiment Analysis (average rating, key themes from justifications), What Went Well, What Could Be Improved, Discussion Points, Action Items, and the Next Scrum Master (as provided in input). Keep it well-formatted and readable."),
}));


// Define the prompt
const retroReportPrompt = ai.definePrompt(
    {
        name: 'retroReportPrompt',
        input: { schema: RetroReportPromptInputSchema },
        output: { schema: PromptOutputSchema }, // Use the simplified output schema for the prompt
        prompt: `
            You are tasked with generating a retrospective summary report for team "{{teamName}}" (ID: {{teamId}}).
            Date of Report: {{currentDate}}

            Current Scrum Master (if any): {{#if currentScrumMaster}}{{currentScrumMaster.name}} ({{currentScrumMaster.email}}){{else}}None{{/if}}
            Next Scrum Master (as determined and provided to you): {{#if nextScrumMaster}}{{nextScrumMaster.name}} ({{nextScrumMaster.email}}){{else}}To be determined or no change{{/if}}

            Sentiment Poll Responses:
            {{#if pollResponses.length}}
                {{#each pollResponses}}
                - {{author.name}} ({{author.email}}): {{rating}} stars. Justification: "{{justification}}"
                {{/each}}
            {{else}}
                No sentiment poll responses were submitted.
            {{/if}}

            Retrospective Items:
            What Went Well:
            {{#if wellItems.length}}
                {{#each wellItems}}
                    - "{{content}}" (by {{author.name}})
                    {{#if replies.length}}
                        {{#each replies}}
                        (Reply by {{author.name}}: "{{content}}")
                        {{/each}}
                    {{/if}}
                {{/each}}
            {{else}}
                No items.
            {{/if}}

            What Could Be Improved:
            {{#if improveItems.length}}
                {{#each improveItems}}
                    - "{{content}}" (by {{author.name}})
                    {{#if replies.length}}
                        {{#each replies}}
                        (Reply by {{author.name}}: "{{content}}")
                        {{/each}}
                    {{/if}}
                {{/each}}
            {{else}}
                No items.
            {{/if}}

            Discussion Topics:
            {{#if discussItems.length}}
                {{#each discussItems}}
                    - "{{content}}" (by {{author.name}})
                    {{#if replies.length}}
                        {{#each replies}}
                        (Reply by {{author.name}}: "{{content}}")
                        {{/each}}
                    {{/if}}
                {{/each}}
            {{else}}
                No items.
            {{/if}}

            Action Items:
            {{#if actionItems.length}}
                {{#each actionItems}}
                    - "{{content}}" (by {{author.name}})
                    {{#if replies.length}}
                        {{#each replies}}
                        (Reply by {{author.name}}: "{{content}}")
                        {{/each}}
                    {{/if}}
                {{/each}}
            {{else}}
                No items.
            {{/if}}

            Task:
            Generate an HTML summary of the retrospective. This summary should be well-formatted for email.
            It should include:
            - Team Name and Date of Report.
            - Sentiment Analysis: Calculate and state the average sentiment rating. Briefly summarize key themes from justifications if available.
            - What Went Well: List items.
            - What Could Be Improved: List items.
            - Discussion Points: List items.
            - Action Items: List items.
            - Next Scrum Master: State the name and email of the next Scrum Master as provided in YOUR input.
            Keep the HTML clean and readable. Use simple tags like <h1>, <h2>, <p>, <ul>, <li>. Do not include <style> tags or complex CSS.

            Return the result ONLY as a JSON object matching the output schema (which means only the 'reportSummaryHtml' field).
        `,
        templateFormat: 'handlebars',
        model: 'googleai/gemini-2.0-flash',
    }
);


// Define the flow
const generateRetroReportFlow = ai.defineFlow<
    typeof GenerateRetroReportInputSchema,
    typeof GenerateRetroReportOutputSchema
>(
    {
        name: 'generateRetroReportFlow',
        inputSchema: GenerateRetroReportInputSchema,
        outputSchema: GenerateRetroReportOutputSchema,
    },
    async (input) => {
        if (!input.teamName || !input.teamId) {
            throw new Error("Team name and ID are required.");
        }

        // 1. Determine the next Scrum Master
        let determinedNextScrumMaster: UserType | null = null;
        const participants: UserType[] = [];

        // Collect unique participants from poll responses
        input.pollResponses.forEach(pr => {
            if (!participants.find(p => p.id === pr.author.id)) {
                participants.push(pr.author);
            }
        });

        // Collect unique participants from retro items
        input.retroItems.forEach(ri => {
            if (!participants.find(p => p.id === ri.author.id)) {
                participants.push(ri.author);
            }
            ri.replies?.forEach(reply => {
                if (!participants.find(p => p.id === reply.author.id)) {
                    participants.push(reply.author);
                }
            });
        });

        const eligibleScrumMasters = participants.filter(p => {
            // Exclude current scrum master if other eligible members exist
            if (input.currentScrumMaster && p.id === input.currentScrumMaster.id) {
                // Only exclude if there's at least one other participant who isn't the current SM
                return participants.some(otherP => otherP.id !== input.currentScrumMaster!.id);
            }
            return true; // Otherwise, everyone is eligible
        });


        if (eligibleScrumMasters.length > 0) {
            // If current SM was excluded and there are others, pick from them
            const candidates = input.currentScrumMaster && eligibleScrumMasters.some(p => p.id !== input.currentScrumMaster!.id)
                ? eligibleScrumMasters.filter(p => p.id !== input.currentScrumMaster!.id)
                : eligibleScrumMasters;

            if (candidates.length > 0) {
                determinedNextScrumMaster = candidates[Math.floor(Math.random() * candidates.length)];
            } else if (input.currentScrumMaster && eligibleScrumMasters.length === 1 && eligibleScrumMasters[0].id === input.currentScrumMaster.id) {
                 // Only current SM participated, so they can be next if no one else is eligible
                determinedNextScrumMaster = input.currentScrumMaster;
            }
        } else if (participants.length === 1 && input.currentScrumMaster && participants[0].id === input.currentScrumMaster.id) {
            // Only the current scrum master participated at all
            determinedNextScrumMaster = input.currentScrumMaster;
        }
        // If no one participated or no eligible SM, determinedNextScrumMaster remains null.


        // 2. Filter items by category
        const wellItems = input.retroItems.filter(item => item.category === 'well');
        const improveItems = input.retroItems.filter(item => item.category === 'improve');
        const discussItems = input.retroItems.filter(item => item.category === 'discuss');
        const actionItems = input.retroItems.filter(item => item.category === 'action');

        // 3. Prepare the input for the prompt
        const promptInput: z.infer<typeof RetroReportPromptInputSchema> = {
            teamId: input.teamId,
            teamName: input.teamName,
            pollResponses: input.pollResponses,
            currentScrumMaster: input.currentScrumMaster,
            nextScrumMaster: determinedNextScrumMaster, // Pass the determined SM
            wellItems,
            improveItems,
            discussItems,
            actionItems,
            currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        };


        try {
            const { output } = await retroReportPrompt(promptInput);
            if (!output) {
                throw new Error("AI failed to generate the report.");
            }
            
            // Combine the generated HTML report with the next Scrum Master determined by the flow logic.
            return {
                reportSummaryHtml: output.reportSummaryHtml,
                nextScrumMaster: determinedNextScrumMaster, // Return the SM determined by the flow
            };

        } catch (error) {
            console.error("Error during retrospective report generation flow:", error);
            throw new Error(`Failed to generate report: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
);

/**
 * Public function to invoke the retrospective report generation flow.
 * @param input - The retrospective data.
 * @returns The generated report HTML and suggested next scrum master.
 */
export async function generateRetroReport(input: GenerateRetroReportInput): Promise<GenerateRetroReportOutput> {
    const validatedInput = GenerateRetroReportInputSchema.parse(input);
    return generateRetroReportFlow(validatedInput);
}

// Type assertions to ensure Zod schemas align with external types at compile time
type _AssertUser = ExternalUser extends z.infer<typeof UserSchema> ? true : false;
type _AssertPollResponse = ExternalPollResponse extends z.infer<typeof PollResponseSchema> ? true : false;
type _AssertRetroItem = ExternalRetroItem extends z.infer<typeof RetroItemSchema> ? true : false;

const _userAssertion: _AssertUser = true;
const _pollResponseAssertion: _AssertPollResponse = true;
const _retroItemAssertion: _AssertRetroItem = true;
