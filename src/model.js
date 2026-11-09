export const tokenize = (text) => {
  if (typeof text !== "string" || text.length > 10000)
    throw new TypeError("Expected text up to 10000 characters");
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
};

export function train(fixtures) {
  const vocabulary = [
    ...new Set(fixtures.train.flatMap(([, text]) => tokenize(text))),
  ].sort();
  const weights = [];
  for (const label of fixtures.labels) {
    const counts = vocabulary.map(() => 1);
    for (const [target, text] of fixtures.train) {
      if (label === target)
        for (const token of tokenize(text)) counts[vocabulary.indexOf(token)]++;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    weights.push(...counts.map((n) => Math.fround(Math.log(n / total))));
  }
  return {
    version: 1,
    algorithm: "multinomial-naive-bayes",
    alpha: 1,
    labels: fixtures.labels,
    vocabulary,
    weights,
    prior: Math.fround(Math.log(1 / fixtures.labels.length)),
  };
}

export function features(model, text) {
  const vector = new Float32Array(model.vocabulary.length);
  for (const token of tokenize(text)) {
    const index = model.vocabulary.indexOf(token);
    if (index >= 0) vector[index]++;
  }
  return vector;
}

export function reference(model, vector) {
  return model.labels.map((_, c) => {
    let score = model.prior;
    for (let i = 0; i < vector.length; i++)
      score = Math.fround(
        score + Math.fround(vector[i] * model.weights[c * vector.length + i]),
      );
    return score;
  });
}

export function classify(model, vector, scores) {
  if (!vector.some((v) => v > 0))
    return { label: "unknown", scores: Array.from(scores) };
  const best = Math.max(...scores);
  return {
    label: model.labels[Array.from(scores).indexOf(best)],
    scores: Array.from(scores),
  };
}
