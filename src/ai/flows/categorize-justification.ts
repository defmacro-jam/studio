'use server';
/**
 * @fileOverview Categorizes user justification based on rating and text using an LLM.
 *
 * - categorizeJustification - A function to categorize feedback.
 * - CategorizeJustificationInput - Input schema for the categorization.
 * - CategorizeJustificationOutput - Output schema for the categorization.
 */
import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

// Define input schema using ai.defineSchema for clarity and potential reuse
const CategorizeJustificationInputSchema = ai.defineSchema(
    'CategorizeJustificationInput',
    z.object({
        rating: z.number().min(1).max(5).describe('Star rating provided by the user (1-5)'),
        justification: z.string().describe('Text justification provided by the user'),
    })
);
export type CategorizeJustificationInput = z.infer<typeof CategorizeJustificationInputSchema>;


// Define output schema using ai.defineSchema
const CategorizeJustificationOutputSchema = ai.defineSchema(
    'CategorizeJustificationOutput',
    z.object({
        category: z.enum(['well', 'improve', 'discuss']).describe("The category the feedback belongs to ('well', 'improve', 'discuss')"),
        reasoning: z.string().optional().describe("Brief explanation for the chosen category"),
    })
);
export type CategorizeJustificationOutput = z.infer<typeof CategorizeJustificationOutputSchema>;

// Define the prompt using ai.definePrompt
const categorizationPrompt = ai.definePrompt(
    {
        name: 'categorizationPrompt',
        input: { schema: CategorizeJustificationInputSchema },
        output: { schema: CategorizeJustificationOutputSchema },
        prompt: `
            Analyze the following team retrospective feedback and categorize it based on the content and rating.
            Rating (1-5 stars, 1=bad, 5=good): {{{rating}}}
            Justification: "{{{justification}}}"

            Categorize the justification into one of the following:
            1.  'well': Positive feedback, things that went well.
            2.  'improve': Constructive criticism, challenges, things that could be better.
            3.  'discuss': Neutral observations, questions, topics needing clarification or team input.

            Rules:
            - Rating 4-5 + positive/neutral text => 'well'.
            - Rating 1-2 + negative text => 'improve'.
            - Rating 3 OR mixed/ambiguous text OR questions => 'discuss'.
            - If justification contradicts rating (e.g., rating 5, text lists problems), prioritize justification sentiment. Consider 'discuss' or 'improve'.
            - If justification has both pros and cons => 'discuss'.
            - If justification is empty or whitespace, rely solely on rating: >= 4 is 'well', <= 2 is 'improve', 3 is 'discuss'.

            Provide a brief reasoning for your choice. Respond ONLY with the JSON object matching the output schema.
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
        const { rating, justification } = input;

        // Handle empty justification explicitly before calling LLM
        if (!justification?.trim()) {
            const category = rating >= 4 ? 'well' : rating <= 2 ? 'improve' : 'discuss';
            return { category, reasoning: "Categorized based on rating only (no justification provided)." };
        }

        try {
            const { output } = await categorizationPrompt(input); // Pass the validated input directly
            return output!; // output should conform to CategorizeJustificationOutputSchema
        } catch (error) {
             console.error("Error during categorization flow:", error);
             // Provide a default fallback response that matches the schema
            return { category: 'discuss', reasoning: 'Failed to categorize due to an internal error. Defaulted to discuss.' };
        }
    }
);


/**
 * Public function to invoke the categorization flow.
 * Ensures the flow is called with validated input.
 * @param input - The justification data.
 * @returns The categorized result.
 */
export async function categorizeJustification(input: CategorizeJustificationInput): Promise<CategorizeJustificationOutput> {
    // Validate input using the Zod schema before calling the flow
    const validatedInput = CategorizeJustificationInputSchema.parse(input);
    return categorizeJustificationFlow(validatedInput);
}


// Ensure the flow is registered by importing its definition file in dev.ts
// e.g., add `import './flows/categorize-justification';` to src/ai/dev.ts if not already present.
