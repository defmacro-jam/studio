'use server';
/**
 * @fileOverview Converts a discussion topic sentence into a concise action item using an LLM.
 *
 * - generateActionItem - Function to generate an action item from a discussion topic.
 * - GenerateActionItemInput - Input schema for the generation.
 * - GenerateActionItemOutput - Output schema for the generation.
 */
import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

// Define input schema
const GenerateActionItemInputSchema = ai.defineSchema(
  'GenerateActionItemInput',
  z.object({
    discussionTopic: z.string().describe('The discussion topic text to be converted into an action item.'),
  })
);
export type GenerateActionItemInput = z.infer<typeof GenerateActionItemInputSchema>;

// Define output schema
const GenerateActionItemOutputSchema = ai.defineSchema(
  'GenerateActionItemOutput',
  z.object({
    actionItem: z.string().describe('The generated concise action item.'),
  })
);
export type GenerateActionItemOutput = z.infer<typeof GenerateActionItemOutputSchema>;

// Define the prompt
const actionItemPrompt = ai.definePrompt(
  {
    name: 'generateActionItemPrompt',
    input: { schema: GenerateActionItemInputSchema },
    output: { schema: GenerateActionItemOutputSchema },
    prompt: `
        Review the following discussion topic from a team retrospective:
        "{{{discussionTopic}}}"

        Your task is to rephrase this topic into a clear, concise, and actionable task. The action item should start with a verb and clearly state what needs to be done. Assign ownership if implied or suggest it if needed (e.g., "Assign someone to...").

        Examples:
        - Discussion Topic: "Should we reconsider our testing strategy?"
          Action Item: "Review and propose changes to the current testing strategy."
        - Discussion Topic: "Deployment process was a bit slow this week."
          Action Item: "Investigate the cause of slow deployment and identify optimization points."
        - Discussion Topic: "Communication needs improvement between teams."
          Action Item: "Schedule a meeting to define clearer communication protocols between teams."
        - Discussion Topic: "Need to update the documentation."
          Action Item: "Assign someone to update the project documentation by [suggested deadline/next sprint]."

        Return the result ONLY as a JSON object matching the output schema, containing the generated 'actionItem'.
      `,
  }
);

// Define the flow
const generateActionItemFlow = ai.defineFlow<
  typeof GenerateActionItemInputSchema,
  typeof GenerateActionItemOutputSchema
>(
  {
    name: 'generateActionItemFlow',
    inputSchema: GenerateActionItemInputSchema,
    outputSchema: GenerateActionItemOutputSchema,
  },
  async (input) => {
    if (!input.discussionTopic?.trim()) {
      // Handle empty input gracefully, maybe return a default action item or throw error
      // For now, let's return a generic action item suggestion
       return { actionItem: "Define action item for the discussed topic." };
      // Alternatively, throw an error: throw new Error("Discussion topic cannot be empty.");
    }

    try {
      const { output } = await actionItemPrompt(input);
      if (!output?.actionItem) {
         // Fallback if AI fails to generate
         console.warn("AI failed to generate action item, using original topic.");
         return { actionItem: `[Action Needed] ${input.discussionTopic}` };
      }
      return output;
    } catch (error) {
      console.error("Error during action item generation flow:", error);
       // Provide a fallback response using the original topic
       return { actionItem: `[Action Needed] ${input.discussionTopic}` };
    }
  }
);

/**
 * Public function to invoke the action item generation flow.
 * @param input - The discussion topic data.
 * @returns The generated action item.
 */
export async function generateActionItem(input: GenerateActionItemInput): Promise<GenerateActionItemOutput> {
  // Basic validation, flow input schema handles more complex validation
  if (!input || !input.discussionTopic) {
    throw new Error('Invalid input: discussionTopic is required.');
  }
  const validatedInput = GenerateActionItemInputSchema.parse(input);
  return generateActionItemFlow(validatedInput);
}
