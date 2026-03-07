from app.agent import Agent
from app.models import (
    AgentState,
    AssistantText,
    LLMResponse,
    NodeConfig,
    NodeType,
    ReceivedMessage,
    ToolCallResult,
)


def test_agent_keeps_running_after_pure_text_response(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["exit"]))
    wait_calls = 0
    llm_messages: list[list[dict]] = []
    responses = iter(
        [
            LLMResponse(content="working through the task"),
            LLMResponse(
                tool_calls=[
                    ToolCallResult(
                        id="call-exit",
                        name="exit",
                        arguments={"reason": "done"},
                    )
                ]
            ),
        ]
    )

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            agent._append_history(
                ReceivedMessage(content="finish the task", from_id="tester")
            )
            agent.set_state(AgentState.RUNNING, "received message from tester")
            return
        raise AssertionError("agent should not auto-idle after pure assistant text")

    def fake_chat(messages, tools=None, on_chunk=None):
        llm_messages.append(messages)
        return next(responses)

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    agent._run()

    assert wait_calls == 1
    assert len(llm_messages) == 2
    assert agent.state == AgentState.TERMINATED
    assert any(
        isinstance(entry, AssistantText) and entry.content == "working through the task"
        for entry in agent.get_history_snapshot()
    )
    assert any(
        msg.get("role") == "assistant"
        and msg.get("content") == "working through the task"
        for msg in llm_messages[1]
    )
