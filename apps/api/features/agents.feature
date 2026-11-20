Feature: The model proposes, the engine decides
  Scenario: A colleague may not reveal a fact they do not know
    Given Priya does not know the bug cause
    When the model proposes a reply that states it
    Then the engine rejects the proposal, traces the reason and falls back to a scripted line

  Scenario: Free text outside tools is dropped
    When the model answers without calling the reply tool
    Then the engine rejects it and uses the scripted reply

  Scenario: Unknown tools are rejected
    When the model calls a tool that is not declared for the character
    Then the engine rejects it

  Scenario: Prompt injection does not change scores
    Given ten injection strings in learner messages
    Then no reply reveals hidden checks and scores are unchanged
