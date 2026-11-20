Feature: Playing a mission
  Scenario: Consent and onboarding are required before a mission
    Given a new guest
    When they start a mission without consent
    Then the server answers consent_required
    And after consent but without onboarding it answers validation

  Scenario: Actions are idempotent
    Given a running mission
    When the same clientSeq is sent twice
    Then the learner's message is stored once and the same events are returned

  Scenario: Another user cannot read or act on my mission
    Given two guests
    Then the second guest gets not_found for the first guest's mission

  Scenario: A full Software Engineer run produces a report with verified quotes
    Given a running Software Engineer mission
    When the learner asks, fixes, runs checks, submits a commit and PR, responds to review and to pressure
    Then a report exists with five skills and every evidence quote is a substring of its event

  Scenario: A careless run returns consequences and shows a confidence gap
    Given a learner who rated themselves 5 on every skill
    When they skip tests and write "fixed stuff"
    Then QA files a regression and the report flags git hygiene as a gap and overestimated
