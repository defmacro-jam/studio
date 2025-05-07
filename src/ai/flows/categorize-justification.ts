'use server';
/**
 * @fileOverview Categorizes each sentence of a user's justification text
 *               into 'well', 'improve', or 'discuss' categories using an LLM.
 *
 * - categorizeJustification - A function to categorize feedback sentences.
 * - CategorizeJustificationInput - Input schema for the categorization.
 * - CategorizeJustificationOutput - Output schema for the categorization (array of sentences).
 */
import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

// Define input schema - Remains the same
const CategorizeJustificationInputSchema = ai.defineSchema(
    'CategorizeJustificationInput',
    z.object({
        rating: z.number().min(1).max(5).describe('Star rating provided by the user (1-5)'),
        justification: z.string().describe('Text justification provided by the user'),
    })
);
export type CategorizeJustificationInput = z.infer<typeof CategorizeJustificationInputSchema>;


// Define the schema for a single categorized sentence
const SentenceCategorySchema = ai.defineSchema(
    'SentenceCategory',
    z.object({
        sentence: z.string().describe("An individual sentence from the justification."),
        category: z.enum(['well', 'improve', 'discuss']).describe("The category the sentence belongs to ('well', 'improve', or 'discuss').")
    })
);

// Define the output schema as an array of categorized sentences
const CategorizeJustificationOutputSchema = ai.defineSchema(
    'CategorizeJustificationOutput',
    z.array(SentenceCategorySchema).describe("An array of categorized sentences from the justification.")
);
export type CategorizeJustificationOutput = z.infer<typeof CategorizeJustificationOutputSchema>;


// Define the prompt using ai.definePrompt
const categorizationPrompt = ai.definePrompt(
    {
        name: 'categorizationPrompt',
        input: { schema: CategorizeJustificationInputSchema },
        output: { schema: CategorizeJustificationOutputSchema },
        prompt: `
            Analyze the following team retrospective feedback justification, ignoring the provided rating for initial categorization of sentences.
            Justification: "{{{justification}}}"

            Your task is to:
            1. Break the justification text into individual sentences.
            2. For EACH sentence, categorize it as 'well', 'improve', or 'discuss'.
                - 'well': Represents positive feedback, successes, or things that went well (e.g., "Deployment was fast", "Great teamwork", "I liked the new feature").
                - 'improve': Represents constructive criticism, challenges, problems, areas for development, or things that could be better (e.g., "The build failed", "Communication was unclear", "Need more testing").
                - 'discuss': Represents neutral observations, questions, explicit discussion points, or suggestions for future consideration (e.g., "We should discuss the new tool", "Is this the right approach?", "Let's explore option X next time", "The timesheet process needs clarification").
            3. If a sentence clearly indicates a need for discussion or is a question, categorize it as 'discuss' even if it has a slightly positive or negative tone, unless the positive/negative aspect is very strong.
            4. If the justification is empty or contains no sentences that fit into 'well', 'improve', or 'discuss', return an empty array.

            Return the results ONLY as a JSON array of objects, where each object contains the 'sentence' and its determined 'category' ('well', 'improve', or 'discuss'). Match the output schema precisely.

            Example Input Justification: "The deployment was smooth. However, the testing phase took too long. We should discuss the process. What about timesheets?"
            Example Output:
            [
              { "sentence": "The deployment was smooth.", "category": "well" },
              { "sentence": "However, the testing phase took too long.", "category": "improve" },
              { "sentence": "We should discuss the process.", "category": "discuss" },
              { "sentence": "What about timesheets?", "category": "discuss" }
            ]

            Example Input Justification: "Project X team was overly needy on the help channel. we got free cookies on wednesday. we should discuss timesheets."
            Example Output:
            [
              { "sentence": "Project X team was overly needy on the help channel.", "category": "improve" },
              { "sentence": "we got free cookies on wednesday.", "category": "well" },
              { "sentence": "we should discuss timesheets.", "category": "discuss" }
            ]
        `,
    }
);


// Define the flow using ai.defineFlow
const categorizeJustificationFlow = ai.defineFlow<
    typeof CategorizeJustificationInputSchema,
    typeof CategorizeJustificationOutputSchema
>(
    {
        name: 'categorizeJustificationFlow',
        inputSchema: CategorizeJustificationInputSchema,
        outputSchema: CategorizeJustificationOutputSchema,
    },
    async (input) => {
        // Let the prompt handle empty justification
        if (!input.justification?.trim()) {
            return []; // Return empty array if justification is empty
        }

        try {
            const { output } = await categorizationPrompt(input); // Pass the validated input directly
            // Output should conform to CategorizeJustificationOutputSchema (array of SentenceCategory)
            // If output is null/undefined (unexpected), return empty array.
            return output ?? [];
        } catch (error) {
             console.error("Error during categorization flow:", error);
             // Provide a default fallback response (empty array)
            return [];
        }
    }
);


/**
 * Public function to invoke the categorization flow.
 * Ensures the flow is called with validated input.
 * @param input - The justification data.
 * @returns An array of categorized sentences.
 */
export async function categorizeJustification(input: CategorizeJustificationInput): Promise<CategorizeJustificationOutput> {
    // Validate input using the Zod schema before calling the flow
    const validatedInput = CategorizeJustificationInputSchema.parse(input);
    return categorizeJustificationFlow(validatedInput);
}


// Ensure the flow is registered by importing its definition file in dev.ts
// e.g., add `import './flows/categorize-justification';` to src/ai/dev.ts if not already present.
