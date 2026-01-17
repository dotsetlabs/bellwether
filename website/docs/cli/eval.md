---
title: eval
sidebar_position: 14
---

# bellwether eval

Evaluate drift detection algorithm accuracy using calibration datasets.

## Synopsis

```bash
bellwether eval [options]
```

## Description

The `eval` command runs the drift detection algorithm against a calibration dataset to measure accuracy. This is useful for:

- Validating drift detection performance
- Testing calibration model updates
- Understanding algorithm behavior across different change types

This is primarily a developer/maintainer command for improving Bellwether's drift detection accuracy.

## Options

### Filter Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --category <categories...>` | Filter by category (security, limitation, assertion) | All |
| `-t, --tags <tags...>` | Filter by tags | All |

### Output Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--json` | Output results as JSON | `false` |
| `--verbose` | Show individual test case results | `false` |
| `--failures` | Only show failed test cases | `false` |
| `--stats` | Show dataset statistics only (no evaluation) | `false` |

### Calibration Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--update-calibration` | Update calibration model from results | `false` |
| `--export-calibration <path>` | Export new calibration model to file | - |
| `--check-embeddings` | Check if Ollama embeddings are available | `false` |

## Examples

### Run Full Evaluation

```bash
bellwether eval
```

Output:
```
Drift Detection Evaluation
==========================

Dataset: 150 test cases
  - assertion: 80 cases
  - security: 45 cases
  - limitation: 25 cases

Results:
  Accuracy: 87.3%
  Precision: 89.1%
  Recall: 85.2%
  F1 Score: 87.1%

By Category:
  assertion:  88.7% accuracy (71/80)
  security:   86.7% accuracy (39/45)
  limitation: 84.0% accuracy (21/25)
```

### Show Only Failures

```bash
bellwether eval --failures --verbose
```

### Filter by Category

```bash
# Only evaluate security-related test cases
bellwether eval --category security

# Evaluate multiple categories
bellwether eval --category security limitation
```

### Export Calibration Model

```bash
bellwether eval --export-calibration ./calibration.json
```

### Check Embedding Support

```bash
bellwether eval --check-embeddings
```

## Use Cases

### Improving Drift Detection

1. Run evaluation to establish baseline accuracy
2. Make changes to comparison algorithms
3. Re-run evaluation to measure improvement
4. Export updated calibration if results improve

### Dataset Statistics

```bash
# View dataset breakdown without running evaluation
bellwether eval --stats
```

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - evaluation completed |
| `1` | Evaluation found issues |
| `2` | Error - evaluation failed |

## See Also

- [feedback](/cli/feedback) - Submit feedback on drift detection
- [Drift Detection](/concepts/drift-detection) - Understanding drift detection
