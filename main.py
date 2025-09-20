import asyncio
from backend.core.session_store import get_session_store

async def main():
    store = await get_session_store()
    session = await store.create_session()
    output = await store.enqueue_input(session.session_id, "Say hello in English.")
    print(output)

asyncio.run(main())
PY
