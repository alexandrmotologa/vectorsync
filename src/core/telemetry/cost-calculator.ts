export interface ModelPricing {
  modelName: string;
  usdPerMillionTokens: number;
}

export const EMBEDDING_MODELS: Record<string, ModelPricing> = {
  'text-embedding-3-small': {
    modelName: 'OpenAI text-embedding-3-small',
    usdPerMillionTokens: 0.02,
  },
  'text-embedding-3-large': {
    modelName: 'OpenAI text-embedding-3-large',
    usdPerMillionTokens: 0.13,
  },
  'cohere-embed-v3': {
    modelName: 'Cohere embed-english-v3.0',
    usdPerMillionTokens: 0.1,
  },
  'voyage-3': {
    modelName: 'Voyage AI voyage-3',
    usdPerMillionTokens: 0.12,
  },
};

export class CostCalculator {
  private pricing: ModelPricing;

  constructor(modelKey: string = 'text-embedding-3-small') {
    this.pricing = EMBEDDING_MODELS[modelKey] ?? EMBEDDING_MODELS['text-embedding-3-small'];
  }

  public calculateSavings(
    tokensSaved: number,
    tokensRequired: number
  ): {
    tokensSaved: number;
    tokensRequired: number;
    costSavedUsd: number;
    costIncurredUsd: number;
    efficiencyPercentage: number;
  } {
    const ratePerToken = this.pricing.usdPerMillionTokens / 1_000_000;
    const costSavedUsd = Number((tokensSaved * ratePerToken).toFixed(6));
    const costIncurredUsd = Number((tokensRequired * ratePerToken).toFixed(6));

    const totalTokens = tokensSaved + tokensRequired;
    const efficiencyPercentage =
      totalTokens > 0 ? Number(((tokensSaved / totalTokens) * 100).toFixed(2)) : 100.0;

    return {
      tokensSaved,
      tokensRequired,
      costSavedUsd,
      costIncurredUsd,
      efficiencyPercentage,
    };
  }

  public getModelName(): string {
    return this.pricing.modelName;
  }
}
