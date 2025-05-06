
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


// Internal schema for the prompt, with pre-filtered items
const RetroReportPromptInputSchema = ai.defineSchema('RetroReportPromptInput', z.object({
    teamId: z.string().describe("The ID of the team."),
    teamName: z.string().describe("The name of the team."),
    pollResponses: z.array(PollResponseSchema).describe("An array of poll responses from the retrospective."),
    currentScrumMaster: UserSchema.nullable().optional().describe("The current scrum master, if any."),
    wellItems: z.array(RetroItemSchema).describe("Items categorized as 'What Went Well'."),
    improveItems: z.array(RetroItemSchema).describe("Items categorized as 'What Could Be Improved'."),
    discussItems: z.array(RetroItemSchema).describe("Items categorized as 'Discussion Topics'."),
    actionItems: z.array(RetroItemSchema).describe("Items categorized as 'Action Items'."),
}));


// Define output schema (remains the same logical structure, but UserSchema is now simpler)
const GenerateRetroReportOutputSchema = ai.defineSchema('GenerateRetroReportOutput', z.object({
    reportSummaryHtml: z.string().describe("A concise HTML summary of the retrospective, suitable for an email. Include sections for Sentiment Analysis (average rating, key themes from justifications), What Went Well, What Could Be Improved, Discussion Points, and Action Items. Keep it well-formatted and readable."),
    nextScrumMaster: UserSchema.nullable().optional().describe("The suggested next scrum master from the team members (excluding current scrum master, if provided). If no other members, can be null."),
}));
export type GenerateRetroReportOutput = z.infer<typeof GenerateRetroReportOutputSchema>;


// Define the prompt
const retroReportPrompt = ai.definePrompt(
    {
        name: 'retroReportPrompt',
        input: { schema: RetroReportPromptInputSchema }, // Use the internal schema with pre-filtered items
        output: { schema: GenerateRetroReportOutputSchema },
        prompt: `
            You are tasked with generating a retrospective summary report for team "{{teamName}}" (ID: {{teamId}}) and suggesting the next Scrum Master.
            Date of Report: {{currentDate}}

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

            Tasks:
            1. Generate an HTML summary of the retrospective. This summary should be well-formatted for email.
               It should include:
               - Team Name and Date of Report (use the provided currentDate).
               - Sentiment Analysis: Calculate and state the average sentiment rating. Briefly summarize key themes from justifications if available.
               - What Went Well: List items.
               - What Could Be Improved: List items.
               - Discussion Points: List items.
               - Action Items: List items.
               Keep the HTML clean and readable. Use simple tags like <h1>, <h2>, <p>, <ul>, <li>. Do not include <style> tags or complex CSS.

            2. Suggest the next Scrum Master.
               - The next Scrum Master should be chosen from the list of unique authors present in the poll responses and retro items (from all categories: wellItems, improveItems, discussItems, actionItems).
               - Exclude the current Scrum Master ({{currentScrumMaster.name}}, if provided) from being suggested again if there are other eligible members.
               - If only the current Scrum Master is available, or no other members participated, they can be suggested again or return null if no one suitable.
               - If multiple members are eligible, you can pick one, perhaps randomly or based on some simple logic (e.g., someone who hasn't been SM recently, though that data isn't provided, so random is fine).
               - If no one participated or is eligible, return null for nextScrumMaster.
               - The output for nextScrumMaster should be the full User object (id, name, email, avatarUrl, role, teamIds if available).

            Return the result ONLY as a JSON object matching the output schema.
        `,
        templateFormat: 'handlebars',
        model: 'googleai/gemini-2.0-flash', // Ensure model is consistent or appropriate for the task. Changed from 1.5 to 2.0 flash
    }
);


// Define the flow
const generateRetroReportFlow = ai.defineFlow<
    typeof GenerateRetroReportInputSchema, // Input is the original combined schema
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

        // Filter items by category before calling the prompt
        const wellItems = input.retroItems.filter(item => item.category === 'well');
        const improveItems = input.retroItems.filter(item => item.category === 'improve');
        const discussItems = input.retroItems.filter(item => item.category === 'discuss');
        const actionItems = input.retroItems.filter(item => item.category === 'action');

        // Prepare the input for the prompt, including the current date
        const promptInput: z.infer<typeof RetroReportPromptInputSchema> & { currentDate: string } = {
            teamId: input.teamId,
            teamName: input.teamName,
            pollResponses: input.pollResponses,
            currentScrumMaster: input.currentScrumMaster,
            wellItems,
            improveItems,
            discussItems,
            actionItems,
            currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        };


        try {
            const { output } = await retroReportPrompt(promptInput); // Call prompt with the structured input
            if (!output) {
                throw new Error("AI failed to generate the report.");
            }

            // Ensure the output structure matches, especially the nextScrumMaster User object
            if (output.nextScrumMaster && typeof output.nextScrumMaster.id === 'undefined') {
                 console.warn("AI suggested nextScrumMaster without full User object details, attempting to find from input...");
                 // Attempt to find a full user object from the input data based on name or email
                 const allParticipants: ExternalUser[] = [];
                 input.pollResponses.forEach(p => { if (p.author) allParticipants.push(p.author as ExternalUser); });
                 input.retroItems.forEach(i => { if (i.author) allParticipants.push(i.author as ExternalUser); });
                 
                 // Deduplicate participants to avoid multiple lookups of the same person
                 const uniqueParticipants = Array.from(new Map(allParticipants.map(p => [p.id, p])).values());

                 const foundUser = uniqueParticipants.find(u => u.name === output.nextScrumMaster?.name || u.email === output.nextScrumMaster?.email);

                 if(foundUser) {
                    output.nextScrumMaster = foundUser as z.infer<typeof UserSchema>; // Cast found user to Zod schema type
                 } else {
                    console.error("Could not fully resolve nextScrumMaster User object from input participants.");
                    output.nextScrumMaster = null; // Set to null if user cannot be fully resolved
                 }
            }

            return output;
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
    // Validate input using the Zod schema before calling the flow
    const validatedInput = GenerateRetroReportInputSchema.parse(input);
    return generateRetroReportFlow(validatedInput);
}

// Ensure the types are compatible between external and Zod schemas
// This is a type assertion, not runtime code.
type _AssertUser = ExternalUser extends z.infer<typeof UserSchema> ? true : false;
type _AssertPollResponse = ExternalPollResponse extends z.infer<typeof PollResponseSchema> ? true : false;
type _AssertRetroItem = ExternalRetroItem extends z.infer<typeof RetroItemSchema> ? true : false;

// These assertions help catch type mismatches during development
// If they cause a type error, the Zod schemas need to be updated to match the external types or vice-versa.
const _userAssertion: _AssertUser = true;
const _pollResponseAssertion: _AssertPollResponse = true;
const _retroItemAssertion: _AssertRetroItem = true;
