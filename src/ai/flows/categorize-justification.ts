'use server';
/**
 * @fileOverview Categorizes each sentence of a user's justification text
 *               into 'well' or 'improve' categories using an LLM.
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
        category: z.enum(['well', 'improve']).describe("The category the sentence belongs to ('well' or 'improve').")
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
            Analyze the following team retrospective feedback justification, ignoring the provided rating.
            Justification: "{{{justification}}}"

            Your task is to:
            1. Break the justification text into individual sentences.
            2. For EACH sentence, categorize it as either 'well' or 'improve'.
                - 'well': Represents positive feedback, successes, or things that went well (e.g., "Deployment was fast", "Great teamwork").
                - 'improve': Represents constructive criticism, challenges, problems, areas for development, or things that could be better (e.g., "The build failed", "Communication was unclear", "Need more testing").
            3. Ignore any sentences that are purely neutral observations, questions, or explicit discussion points (e.g., "We should discuss this", "Is this the right approach?"). Do not include these neutral/discussion sentences in the output array.
            4. If the justification is empty or contains no sentences that fit into 'well' or 'improve', return an empty array.

            Return the results ONLY as a JSON array of objects, where each object contains the 'sentence' and its determined 'category' ('well' or 'improve'). Match the output schema precisely.

            Example Input Justification: "The deployment was smooth. However, the testing phase took too long. We should discuss the process."
            Example Output:
            [
              { "sentence": "The deployment was smooth.", "category": "well" },
              { "sentence": "However, the testing phase took too long.", "category": "improve" }
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
