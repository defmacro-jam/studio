

'use server';
/**
 * @fileOverview Generates a retrospective report and suggests the next scrum master.
 *
 * - generateRetroReport - A function to generate the report and suggest next scrum master.
 * - GenerateRetroReportInput - The input type for the function.
 * - GenerateRetroReportOutput - The return type for the function.
 */

import { ai } from '@/ai/ai-instance';
// Use PlainPollResponse and PlainRetroItem for the public interface's GenerateRetroReportInput
import type { PlainPollResponse, PlainRetroItem, User as ExternalUser, GenerateRetroReportInput as ExternalGenerateRetroReportInput } from '@/lib/types';
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


// Internal Zod schema for PollResponse, expecting string timestamp
const PollResponseSchema = z.object({
    id: z.string(),
    author: UserSchema,
    rating: z.number(),
    justification: z.string(),
    timestamp: z.string().describe("ISO 8601 date string for the poll response."),
    teamId: z.string().optional(),
});

// Internal Zod schema for RetroItem, expecting string timestamp
const RetroItemSchema: z.ZodType<PlainRetroItem> = z.lazy(() => // Use z.lazy for self-referencing types
    z.object({
        id: z.string(),
        author: UserSchema,
        content: z.string(),
        timestamp: z.string().describe("ISO 8601 date string for the retro item."),
        replies: z.array(RetroItemSchema).optional(), // Replies also use PlainRetroItem, so string timestamps
        category: z.enum(['well', 'improve', 'discuss', 'action']),
        isFromPoll: z.boolean().optional(),
        pollResponseId: z.string().optional(),
        teamId: z.string().optional(),
    })
);


// This is the Zod schema for the flow's input, aligning with ExternalGenerateRetroReportInput
const GenerateRetroReportInputSchema = ai.defineSchema('GenerateRetroReportInput', z.object({
    teamId: z.string().describe("The ID of the team."),
    teamName: z.string().describe("The name of the team."),
    pollResponses: z.array(PollResponseSchema).describe("An array of poll responses from the retrospective, with string timestamps."),
    retroItems: z.array(RetroItemSchema).describe("An array of all retro items (well, improve, discuss, action), with string timestamps."),
    currentScrumMaster: UserSchema.nullable().optional().describe("The current scrum master, if any."),
    nextScrumMaster: UserSchema.nullable().optional().describe("The determined next scrum master for the team."), // This field is now part of the input to the flow
}));
// The public function `generateRetroReport` will expect `ExternalGenerateRetroReportInput` which uses PlainPollResponse/PlainRetroItem


// Internal schema for the prompt, with pre-filtered items AND the determined next scrum master
const RetroReportPromptInputSchema = ai.defineSchema('RetroReportPromptInput', z.object({
    teamId: z.string().describe("The ID of the team."),
    teamName: z.string().describe("The name of the team."),
    pollResponses: z.array(PollResponseSchema).describe("An array of poll responses from the retrospective."),
    currentScrumMaster: UserSchema.nullable().optional().describe("The current scrum master, if any."),
    nextScrumMaster: UserSchema.nullable().optional().describe("The determined next scrum master for the team."),
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
                - {{author.name}} ({{author.email}}): {{rating}} stars. Justification: "{{justification}}" (Submitted: {{timestamp}})
                {{/each}}
            {{else}}
                No sentiment poll responses were submitted.
            {{/if}}

            Retrospective Items:
            What Went Well:
            {{#if wellItems.length}}
                {{#each wellItems}}
                    - "{{content}}" (by {{author.name}}, Submitted: {{timestamp}})
                    {{#if replies.length}}
                        {{#each replies}}
                        (Reply by {{author.name}}: "{{content}}", Submitted: {{timestamp}})
                        {{/each}}
                    {{/if}}
                {{/each}}
            {{else}}
                No items.
            {{/if}}

            What Could Be Improved:
            {{#if improveItems.length}}
                {{#each improveItems}}
                    - "{{content}}" (by {{author.name}}, Submitted: {{timestamp}})
                    {{#if replies.length}}
                        {{#each replies}}
                        (Reply by {{author.name}}: "{{content}}", Submitted: {{timestamp}})
                        {{/each}}
                    {{/if}}
                {{/each}}
            {{else}}
                No items.
            {{/if}}

            Discussion Topics:
            {{#if discussItems.length}}
                {{#each discussItems}}
                    - "{{content}}" (by {{author.name}}, Submitted: {{timestamp}})
                    {{#if replies.length}}
                        {{#each replies}}
                        (Reply by {{author.name}}: "{{content}}", Submitted: {{timestamp}})
                        {{/each}}
                    {{/if}}
                {{/each}}
            {{else}}
                No items.
            {{/if}}

            Action Items:
            {{#if actionItems.length}}
                {{#each actionItems}}
                    - "{{content}}" (by {{author.name}}, Submitted: {{timestamp}})
                    {{#if replies.length}}
                        {{#each replies}}
                        (Reply by {{author.name}}: "{{content}}", Submitted: {{timestamp}})
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
    z.infer<typeof GenerateRetroReportInputSchema>, // The flow receives data validated against this Zod schema
    GenerateRetroReportOutput // The flow returns this type
>(
    {
        name: 'generateRetroReportFlow',
        inputSchema: GenerateRetroReportInputSchema, // Use the Zod schema for flow input
        outputSchema: GenerateRetroReportOutputSchema,
    },
    async (input) => {
        if (!input.teamName || !input.teamId) {
            throw new Error("Team name and ID are required.");
        }

        // The nextScrumMaster is now passed in the input to the flow.
        const determinedNextScrumMaster = input.nextScrumMaster;

        // Filter items by category
        const wellItems = input.retroItems.filter(item => item.category === 'well');
        const improveItems = input.retroItems.filter(item => item.category === 'improve');
        const discussItems = input.retroItems.filter(item => item.category === 'discuss');
        const actionItems = input.retroItems.filter(item => item.category === 'action');

        const promptInput: z.infer<typeof RetroReportPromptInputSchema> = {
            teamId: input.teamId,
            teamName: input.teamName,
            pollResponses: input.pollResponses,
            currentScrumMaster: input.currentScrumMaster,
            nextScrumMaster: determinedNextScrumMaster,
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
            
            return {
                reportSummaryHtml: output.reportSummaryHtml,
                nextScrumMaster: determinedNextScrumMaster,
            };

        } catch (error) {
            console.error("Error during retrospective report generation flow:", error);
            throw new Error(`Failed to generate report: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
);

/**
 * Public function to invoke the retrospective report generation flow.
 * @param input - The retrospective data, conforming to ExternalGenerateRetroReportInput.
 * @returns The generated report HTML and suggested next scrum master.
 */
export async function generateRetroReport(input: ExternalGenerateRetroReportInput): Promise<GenerateRetroReportOutput> {
    // Validate input using the Zod schema before calling the flow
    // The input here comes from the client and should already have plain timestamps
    const validatedInput = GenerateRetroReportInputSchema.parse(input);
    return generateRetroReportFlow(validatedInput);
}

// Type assertions are removed as the internal Zod schemas now correctly expect plain string timestamps,
// and the responsibility of converting complex Timestamps to strings lies with the caller of generateRetroReport.
// The public `generateRetroReport` function now expects `ExternalGenerateRetroReportInput` which uses `PlainPollResponse` and `PlainRetroItem`.
