from __future__ import annotations

import argparse
import getpass
import sys
from typing import Any, Sequence

from .client import ApiClient, ApiError, BackendUnavailableError, MalformedResponseError
from .session import SessionError, SessionState, load_session, save_session

SAFE_FAILURE_EXIT = 1
AUTH_EXIT = 2
USAGE_EXIT = 2


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        return args.handler(args)
    except ApiError as exc:
        _print_api_error(exc)
        return AUTH_EXIT if exc.status_code in (401, 403) else SAFE_FAILURE_EXIT
    except BackendUnavailableError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return SAFE_FAILURE_EXIT
    except MalformedResponseError as exc:
        print(f"Error: malformed-response: {exc}", file=sys.stderr)
        return SAFE_FAILURE_EXIT
    except SessionError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return AUTH_EXIT


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="buildingagent", description="BuildingAgent authenticated local project chat CLI")
    subcommands = parser.add_subparsers(dest="command", required=True)

    login_parser = subcommands.add_parser("login", help="Authenticate against the BuildingAgent backend")
    login_parser.add_argument("--email", required=True, help="Login email")
    login_parser.add_argument("--password", help="Login password; prompts when omitted")
    login_parser.set_defaults(handler=cmd_login)

    project_parser = subcommands.add_parser("project", help="List or select projects through the backend")
    project_subcommands = project_parser.add_subparsers(dest="project_command", required=True)
    project_list = project_subcommands.add_parser("list", help="List backend-authorized projects")
    project_list.set_defaults(handler=cmd_project_list)
    project_use = project_subcommands.add_parser("use", help="Select a project by id or exact name")
    project_use.add_argument("project", help="Project id or exact project name")
    project_use.set_defaults(handler=cmd_project_use)

    chat_parser = subcommands.add_parser("chat", help="Send messages or inspect selected-project history")
    chat_subcommands = chat_parser.add_subparsers(dest="chat_command", required=True)
    chat_send = chat_subcommands.add_parser("send", help="Send a chat message to the selected project")
    chat_send.add_argument("message", nargs="?", help="Message text")
    chat_send.set_defaults(handler=cmd_chat_send)
    chat_history = chat_subcommands.add_parser("history", help="Show selected-project chat history")
    chat_history.set_defaults(handler=cmd_chat_history)
    return parser


def cmd_login(args: argparse.Namespace) -> int:
    password = args.password if args.password is not None else getpass.getpass("Password: ")
    client = ApiClient()
    body = client.login(args.email, password)
    token = _required_str(body, "accessToken")
    token_type = _required_str(body, "tokenType")
    user = body.get("user")
    if token_type.lower() != "bearer" or not isinstance(user, dict):
        raise MalformedResponseError("Malformed response from backend.")
    save_session(SessionState(access_token=token))
    display = user.get("displayName") if isinstance(user.get("displayName"), str) else args.email
    print(f"Logged in as {display}.")
    print("Session saved. Select a project with `buildingagent project use <project-id-or-name>`.")
    return 0


def cmd_project_list(args: argparse.Namespace) -> int:
    state = load_session()
    projects = _projects(ApiClient().list_projects(state.access_token))
    if not projects:
        print("No projects available.")
        return 0
    for project in projects:
        print(f"{_required_str(project, 'id')}\t{_required_str(project, 'name')}")
    return 0


def cmd_project_use(args: argparse.Namespace) -> int:
    state = load_session()
    client = ApiClient()
    projects = _projects(client.list_projects(state.access_token))
    selected = _find_project(projects, args.project)
    if selected is None:
        print(f"Error: project not found or not accessible: {args.project}", file=sys.stderr)
        return SAFE_FAILURE_EXIT
    selected_id = _required_str(selected, "id")
    selected_project = client.select_project(state.access_token, selected_id).get("selectedProject")
    if not isinstance(selected_project, dict):
        raise MalformedResponseError("Malformed response from backend.")
    save_session(state.with_project(_required_str(selected_project, "id")))
    print(f"Selected project: {_required_str(selected_project, 'name')} ({_required_str(selected_project, 'id')})")
    return 0


def cmd_chat_send(args: argparse.Namespace) -> int:
    if args.message is None or not args.message.strip():
        print("Error: chat message cannot be empty.", file=sys.stderr)
        return USAGE_EXIT
    state = _require_project(load_session())
    body = ApiClient().chat_send(state.access_token, state.selected_project_id or "", args.message)
    messages = _messages(body)
    for message in messages:
        print(f"{_required_str(message, 'role')}: {_required_str(message, 'content')}")
    return 0


def cmd_chat_history(args: argparse.Namespace) -> int:
    state = _require_project(load_session())
    body = ApiClient().chat_history(state.access_token, state.selected_project_id or "")
    messages = _messages(body)
    if not messages:
        print("No chat messages yet.")
        return 0
    for message in messages:
        print(f"{_required_str(message, 'role')}: {_required_str(message, 'content')}")
    return 0


def _require_project(state: SessionState) -> SessionState:
    if not state.selected_project_id:
        raise SessionError("No selected project. Run `buildingagent project use <project-id-or-name>` first.")
    return state


def _projects(body: dict[str, Any]) -> list[dict[str, Any]]:
    projects = body.get("projects")
    if not isinstance(projects, list) or any(not isinstance(project, dict) for project in projects):
        raise MalformedResponseError("Malformed response from backend.")
    return projects


def _messages(body: dict[str, Any]) -> list[dict[str, Any]]:
    messages = body.get("messages")
    if not isinstance(messages, list) or any(not isinstance(message, dict) for message in messages):
        raise MalformedResponseError("Malformed response from backend.")
    return messages


def _find_project(projects: list[dict[str, Any]], identifier: str) -> dict[str, Any] | None:
    normalized = identifier.strip().lower()
    for project in projects:
        project_id = project.get("id")
        name = project.get("name")
        if isinstance(project_id, str) and project_id.lower() == normalized:
            return project
        if isinstance(name, str) and name.lower() == normalized:
            return project
    return None


def _required_str(body: dict[str, Any], key: str) -> str:
    value = body.get(key)
    if not isinstance(value, str) or not value:
        raise MalformedResponseError("Malformed response from backend.")
    return value


def _print_api_error(exc: ApiError) -> None:
    request_part = f" requestId={exc.request_id}" if exc.request_id else ""
    print(f"Error: backend {exc.status_code} {exc.code}: {exc.message}{request_part}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
