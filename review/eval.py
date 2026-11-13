"""Measure how well the model flags buggy lines.

    uv run python eval.py [model-id]

Prints, per prompt variant, recall and false positives at several thresholds, so
prompt or threshold changes are judged on all cases, not on one example.
"""

import sys
from pathlib import Path

import torch
from transformers import AutoModel

import worker

ROOT = Path(__file__).resolve().parent.parent

# (name, code, 1-based lines with a bug). "held-out" cases were never used for tuning.
CASES = [
    ("py syntax+name", '''def average(nums):
    total = 0
    for n in nums
        total += n
    return total / len(nums)

print(average([1, 2, 3])
result = averag([4, 5])
print("ok")''', {3, 7, 8}),
    ("js const+name+assign", '''function greet(name) {
  const msg = "Hello, " + name;
  msg = msg + "!";
  return mesage;
}
let n = 5;
console.log(greet("Ann"));
if (n = 10) { console.log("ten"); }''', {3, 4, 8}),
    ("go palindrome logic", '''package main

import "fmt"

// isPalindrome reports whether the slice reads the same forwards and backwards.
func isPalindrome(nums []int) bool {
	if len(nums) == 0 {
		return true
	}

	for i := 0; i < len(nums)/2-1; i++ {
		j := len(nums) - 1 - i
		if nums[i] < nums[j] {
			return false
		}
	}
	return true
}

func main() {
	tests := [][]int{
		{1, 2, 3, 2, 1},
		{1, 2, 2, 1},
		{1, 2, 3, 4, 5},
		{5, 2, 3, 4, 1},
		{1, 2, 3, 1},
		{7},
		{},
	}

	for _, t := range tests {
		fmt.Printf("%v -> %v\\n", t, isPalindrome(t))
	}
}''', {11, 13}),
    ("ts clean ping.ts", (ROOT / "src/commands/ping.ts").read_text().rstrip(), set()),
    ("ts clean poll.ts", (ROOT / "src/commands/poll.ts").read_text().rstrip(), set()),
    # held-out
    ("held-out java off-by-one", '''public class Sum {
    static int sum(int[] arr) {
        int total = 0;
        for (int i = 0; i <= arr.length; i++) {
            total += arr[i];
        }
        return total;
    }

    public static void main(String[] args) {
        System.out.println(sum(new int[] {1, 2, 3}));
    }
}''', {4}),
    ("held-out py return in loop", '''def find_max(values):
    """Return the largest value in a non-empty list."""
    best = values[0]
    for v in values:
        if v > best:
            best = v
        return best


print(find_max([3, 9, 4]))''', {7}),
    ("held-out c syntax+assign", '''#include <stdio.h>

int main(void) {
    int count = 3
    if (count = 0) {
        printf("empty\\n");
    }
    printf("%d\\n", count);
    return 0;
}''', {4, 5}),
    ("held-out go clean palindrome", '''package main

import "fmt"

// isPalindrome reports whether the slice reads the same forwards and backwards.
func isPalindrome(nums []int) bool {
	for i, j := 0, len(nums)-1; i < j; i, j = i+1, j-1 {
		if nums[i] != nums[j] {
			return false
		}
	}
	return true
}

func main() {
	fmt.Println(isPalindrome([]int{1, 2, 1}), isPalindrome([]int{1, 2}))
}''', set()),
]

PROMPTS = {
    "current": worker.LINE_PROMPT,
    "intent": (
        "Line {n} is `{line}`. Read the whole program, including what each function's name and "
        "comments say it should do. Does this line contain a bug: will it fail to compile, crash, "
        "or make the program produce a wrong result? A line that is valid and does what the code "
        "intends is correct."
    ),
    "short": "Is line {n} (`{line}`) buggy?",
}

THRESHOLDS = (0.5, 0.6, 0.7, 0.8, 0.9)


def main() -> None:
    model_id = sys.argv[1] if len(sys.argv) > 1 else worker.MODEL_ID
    model = AutoModel.from_pretrained(model_id, trust_remote_code=True, dtype=torch.float32)
    model.eval()
    bugs_total = sum(len(bugs) for _, _, bugs in CASES)
    for prompt_name, prompt in PROMPTS.items():
        scores = {}
        with torch.inference_mode():
            for name, code, _ in CASES:
                scores[name] = worker.line_scores(model, code.split("\n"), prompt)
        print(f"\n== {model_id} / {prompt_name}")
        for name, _, bugs in CASES:
            top = sorted(scores[name], key=scores[name].get, reverse=True)[:3]
            print(f"  {name:30} bugs={sorted(bugs)} top3=" +
                  ", ".join(f"{n}:{scores[name][n]:.2f}" for n in top))
        for t in THRESHOLDS:
            found = sum(scores[name].get(n, 0) >= t for name, _, bugs in CASES for n in bugs)
            false = sum(p >= t and n not in bugs for name, _, bugs in CASES for n, p in scores[name].items())
            print(f"  t={t}: recall {found}/{bugs_total}  false positives {false}")


if __name__ == "__main__":
    main()
