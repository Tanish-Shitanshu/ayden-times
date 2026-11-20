Feature: Privacy tiers
  Scenario: Groups smaller than five reveal nothing
    Given a cohort with four members who agreed to share
    Then insights are suppressed and contain no numbers

  Scenario: Only consenting members count
    Given five consenting members and one who did not consent
    Then patterns are computed from five

  Scenario: Learners can export and delete everything
    Given a learner with a finished mission
    When they export and then delete their data
    Then the export contains their messages and the store has no sessions for them
