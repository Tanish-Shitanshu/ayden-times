Feature: Quote-bound scoring
  Scenario: A judge quote that is not in the learner's words earns nothing
    Given the judge claims an anchor with an invented quote
    Then the anchor is not credited and quotesRejected increases

  Scenario: Two judge runs that disagree make the skill uncertain
    Given two judge runs with different verdicts
    Then the skill state is uncertain

  Scenario: Code signals come first
    Given the AI judge is unavailable
    Then the report is still produced with rule-based soft anchors and says so
