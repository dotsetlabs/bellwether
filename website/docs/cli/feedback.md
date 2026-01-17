---
title: feedback
sidebar_position: 15
---

# bellwether feedback

Submit feedback on drift detection decisions to improve accuracy.

## Synopsis

```bash
bellwether feedback [options] [decision-id]
```

## Description

The `feedback` command allows you to report when Bellwether's drift detection makes incorrect decisions. This feedback is used to improve the drift detection algorithm over time.

Common scenarios for feedback:
- **False positive**: Bellwether reported a change that wasn't actually a behavioral change
- **False negative**: Bellwether missed a change that should have been reported
- **Confidence wrong**: The change was detected but the confidence score was inaccurate

## Arguments

| Argument | Description |
|:---------|:------------|
| `[decision-id]` | ID of the comparison decision to report on |

## Options

### Feedback Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-t, --type <type>` | Feedback type: `false_positive`, `false_negative`, `confidence_wrong` | - |
| `-m, --message <message>` | Comment explaining the issue | - |
| `--correct <answer>` | What the correct answer should have been (`true`/`false`) | - |

### Query Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--list` | List recent decisions that can receive feedback | `false` |
| `--stats` | Show feedback statistics | `false` |
| `--analyze` | Analyze all feedback for patterns | `false` |
| `--export <path>` | Export decisions to file for analysis | - |
| `--clear` | Clear all logged decisions and feedback | `false` |

## Examples

### List Recent Decisions

```bash
bellwether feedback --list
```

Output:
```
Recent Drift Detection Decisions
================================

ID       | Tool        | Change Type    | Detected | Confidence
---------|-------------|----------------|----------|------------
dec_a1b2 | read_file   | assertion      | true     | 85%
dec_c3d4 | write_file  | security       | true     | 72%
dec_e5f6 | list_dir    | none           | false    | -

Use: bellwether feedback <id> --type <type> --message "..."
```

### Submit Feedback

```bash
# Report a false positive
bellwether feedback dec_a1b2 \
  --type false_positive \
  --message "This change was just a wording improvement, not a behavioral change"

# Report a false negative
bellwether feedback dec_e5f6 \
  --type false_negative \
  --correct true \
  --message "This actually changed the error message format"

# Report incorrect confidence
bellwether feedback dec_c3d4 \
  --type confidence_wrong \
  --message "This should have been 95%+ confidence, it's a clear security change"
```

### View Feedback Statistics

```bash
bellwether feedback --stats
```

Output:
```
Feedback Statistics
===================

Total feedback submitted: 45
  - False positives: 20 (44%)
  - False negatives: 15 (33%)
  - Confidence wrong: 10 (22%)

Most common patterns:
  - Wording changes flagged as behavioral: 12 cases
  - Minor formatting changes: 8 cases
```

### Analyze Feedback Patterns

```bash
bellwether feedback --analyze
```

### Export for Analysis

```bash
bellwether feedback --export ./decisions.json
```

### Clear All Data

```bash
bellwether feedback --clear
```

## How Feedback Improves Accuracy

1. **Local learning**: Feedback is stored locally and used to calibrate confidence scores
2. **Pattern recognition**: Common false positive/negative patterns are identified
3. **Threshold adjustment**: Confidence thresholds can be tuned based on your feedback

## Privacy

Feedback data is stored locally in `~/.bellwether/feedback/`. No data is sent to external servers unless you explicitly export and share it.

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - feedback submitted or query completed |
| `1` | Invalid feedback (missing required options) |
| `2` | Error - operation failed |

## See Also

- [eval](/cli/eval) - Evaluate drift detection accuracy
- [Drift Detection](/concepts/drift-detection) - Understanding drift detection
- [Configuration](/guides/configuration) - Configure confidence thresholds
