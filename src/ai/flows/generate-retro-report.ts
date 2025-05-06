
'use server';
/**
 * @fileOverview Generates a retrospective report and suggests the next scrum master.
 *
 * - generateRetroReport - A function to generate the report and suggest next scrum master.
 * - GenerateRetroReportInput - The input type for the function.
 * - GenerateRetroReportOutput - The return type for the function.
 */

import { ai } from '@/ai/ai-instance';
import type { GenerateRetroReportInput, GenerateRetroReportOutput, PollResponse, RetroItem, User } from '@/lib/types';
import { z } from 'genkit';

// Define input schema
const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    avatarUrl: z.string().url(),
    role: z.string(), // Assuming role is a string, adjust if it's an enum from lib/types
    teamIds: z.array(z.string()).optional(),
});

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


const GenerateRetroReportInputSchema = ai.defineSchema('GenerateRetroReportInput', z.object({
    teamId: z.string().describe("The ID of the team."),
    teamName: z.string().describe("The name of the team."),
    pollResponses: z.array(PollResponseSchema).describe("An array of poll responses from the retrospective."),
    retroItems: z.array(RetroItemSchema).describe("An array of all retro items (well, improve, discuss, action)."),
    currentScrumMaster: UserSchema.nullable().optional().describe("The current scrum master, if any."),
}));


// Define output schema
const GenerateRetroReportOutputSchema = ai.defineSchema('GenerateRetroReportOutput', z.object({
    reportSummaryHtml: z.string().describe("A concise HTML summary of the retrospective, suitable for an email. Include sections for Sentiment Analysis (average rating, key themes from justifications), What Went Well, What Could Be Improved, Discussion Points, and Action Items. Keep it well-formatted and readable."),
    nextScrumMaster: UserSchema.nullable().optional().describe("The suggested next scrum master from the team members (excluding current scrum master, if provided). If no other members, can be null."),
}));


// Define the prompt
const retroReportPrompt = ai.definePrompt(
    {
        name: 'retroReportPrompt',
        input: { schema: GenerateRetroReportInputSchema },
        output: { schema: GenerateRetroReportOutputSchema },
        prompt: `
            You are tasked with generating a retrospective summary report for team "{{teamName}}" (ID: {{teamId}}) and suggesting the next Scrum Master.

            Current Scrum Master (if any): {{#if currentScrumMaster}}{{currentScrumMaster.name}} ({{currentScrumMaster.email}}){{else}}None{{/if}}

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
            {{#each (filterItems retroItems "well")}}
                - "{{content}}" (by {{author.name}})
                {{#if replies}}
                    {{#each replies}}
                    (Reply by {{author.name}}: "{{content}}")
                    {{/each}}
                {{/if}}
            {{else}}
                No items.
            {{/each}}

            What Could Be Improved:
            {{#each (filterItems retroItems "improve")}}
                - "{{content}}" (by {{author.name}})
                {{#if replies}}
                    {{#each replies}}
                    (Reply by {{author.name}}: "{{content}}")
                    {{/each}}
                {{/if}}
            {{else}}
                No items.
            {{/each}}

            Discussion Topics:
            {{#each (filterItems retroItems "discuss")}}
                - "{{content}}" (by {{author.name}})
                {{#if replies}}
                    {{#each replies}}
                    (Reply by {{author.name}}: "{{content}}")
                    {{/each}}
                {{/if}}
            {{else}}
                No items.
            {{/each}}

            Action Items:
            {{#each (filterItems retroItems "action")}}
                - "{{content}}" (by {{author.name}})
                {{#if replies}}
                    {{#each replies}}
                    (Reply by {{author.name}}: "{{content}}")
                    {{/each}}
                {{/if}}
            {{else}}
                No items.
            {{/each}}

            Tasks:
            1. Generate an HTML summary of the retrospective. This summary should be well-formatted for email.
               It should include:
               - Team Name and Date of Report (assume today).
               - Sentiment Analysis: Calculate and state the average sentiment rating. Briefly summarize key themes from justifications if available.
               - What Went Well: List items.
               - What Could Be Improved: List items.
               - Discussion Points: List items.
               - Action Items: List items.
               Keep the HTML clean and readable. Use simple tags like <h1>, <h2>, <p>, <ul>, <li>. Do not include <style> tags or complex CSS.

            2. Suggest the next Scrum Master.
               - The next Scrum Master should be chosen from the list of unique authors present in the poll responses and retro items.
               - Exclude the current Scrum Master ({{currentScrumMaster.name}}, if provided) from being suggested again if there are other eligible members.
               - If only the current Scrum Master is available, or no other members participated, they can be suggested again or return null if no one suitable.
               - If multiple members are eligible, you can pick one, perhaps randomly or based on some simple logic (e.g., someone who hasn't been SM recently, though that data isn't provided, so random is fine).
               - If no one participated or is eligible, return null for nextScrumMaster.
               - The output for nextScrumMaster should be the full User object.

            Return the result ONLY as a JSON object matching the output schema.
        `,
        templateFormat: 'handlebars',
        model: 'googleai/gemini-2.0-flash', // Or your preferred model
        // Define a Handlebars helper to filter items by category
        helpers: {
            filterItems: (items: RetroItem[], category: string) => {
                return items.filter(item => item.category === category);
            }
        }
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
        // Basic input validation or transformation if needed before calling the prompt
        if (!input.teamName || !input.teamId) {
            throw new Error("Team name and ID are required.");
        }

        try {
            const { output } = await retroReportPrompt(input);
            if (!output) {
                throw new Error("AI failed to generate the report.");
            }
            // Ensure the output structure matches, especially the nextScrumMaster User object
            if (output.nextScrumMaster && typeof output.nextScrumMaster.id === 'undefined') {
                 console.warn("AI suggested nextScrumMaster without full User object details, attempting to find from input...");
                 // Attempt to find the full user object from the input if only partial data was returned by AI (less ideal)
                 const allParticipants = [...input.pollResponses.map(p => p.author), ...input.retroItems.map(i => i.author)];
                 const foundUser = allParticipants.find(u => u.name === output.nextScrumMaster?.name || u.email === output.nextScrumMaster?.email);
                 if(foundUser) output.nextScrumMaster = foundUser;
                 else {
                    console.error("Could not fully resolve nextScrumMaster User object.");
                    // Set to null if can't resolve to avoid partial data
                    output.nextScrumMaster = null;
                 }
            }

            return output;
        } catch (error) {
            console.error("Error during retrospective report generation flow:", error);
            // Provide a fallback or rethrow
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
    // Validate input using the Zod schema before calling the flow
    const validatedInput = GenerateRetroReportInputSchema.parse(input);
    return generateRetroReportFlow(validatedInput);
}
