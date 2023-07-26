import { useEffect, useRef, useReducer, useState } from "react";
import Head from "next/head";
import ChatForm from "./components/ChatForm";
import Message from "./components/Message";
import SlideOver from "./components/SlideOver";
import EmptyState from "./components/EmptyState";
import { Cog6ToothIcon } from "@heroicons/react/20/solid";
import LoadingChatLine from "./components/LoadingChatLine";

function approximateTokenCount(text) {
  return Math.ceil(text.length * 0.4);
}

export default function Home() {
  const MAX_TOKENS = 4096;
  const bottomRef = useRef(null);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [eventSource, setEventSource] = useState(null);
  const [open, setOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a friendly assistant."
  );
  const [loading, setLoading] = useState(false);

  const [currentMessage, dispatchCurrentMessage] = useReducer(
    (state, action) => {
      switch (action.type) {
        case "append":
          bottomRef.current.scrollIntoView({ behavior: "smooth" });
          //   return { ...state, buffer: state.buffer + action.payload };
          return {
            ...state,
            displayed: state.displayed + action.payload,
            buffer: state.buffer + action.payload,
          };
        case "display":
          bottomRef.current.scrollIntoView({ behavior: "smooth" });
          return {
            ...state,
            displayed: state.displayed + state.buffer[state.displayed.length],
          };
        case "reset":
          return { buffer: "", displayed: "" };
        default:
          throw new Error();
      }
    },
    { buffer: "", displayed: "" }
  );
  const intervalRef = useRef(null);

  const [error, setError] = useState(null);

  const handleSettingsSubmit = async (event) => {
    event.preventDefault();
    setOpen(false);
    setSystemPrompt(event.target.systemPrompt.value);
  };

  const handleSubmit = async (userMessage) => {
    setLoading(true);

    const SNIP = "<!-- snip -->";

    if (eventSource) {
      eventSource.close();
    }

    const messageHistory = [...messages];
    if (currentMessage.buffer.length > 0) {
      messageHistory.push({
        text: currentMessage.buffer,
        isUser: false,
      });
    }
    messageHistory.push({
      text: userMessage,
      isUser: true,
    });

    const generatePrompt = (messages) => {
      return messages
        .map((message) =>
          message.isUser
            ? `User: ${message.text}`
            : `Assistant: ${message.text}`
        )
        .join("\n");
    };

    // Generate initial prompt and calculate tokens
    let prompt = `${generatePrompt(messageHistory)}\nAssistant: `;

    // Check if we exceed max tokens and truncate the message history if so.
    while (approximateTokenCount(prompt) > MAX_TOKENS) {
      if (messageHistory.length < 3) {
        setError(
          "Your message is too long. Please try again with a shorter message."
        );

        return;
      }

      // Remove the third message from history, keeping the original exchange.
      messageHistory.splice(1, 2);

      // Recreate the prompt
      prompt = `${SNIP}\n${generatePrompt(messageHistory)}\nAssistant: `;
    }

    setMessages(messageHistory);

    console.log(systemPrompt);

    const response = await fetch("/api/predictions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: `${prompt}
Assistant:`,
        systemPrompt: systemPrompt,
      }),
    });

    const prediction = await response.json();
    if (response.status !== 201) {
      setError(prediction.detail);
      return;
    }
    setPrediction(prediction);
    setLoading(false);
  };

  useEffect(() => {
    if (!prediction?.urls?.stream) {
      return;
    }

    const source = new EventSource(prediction.urls.stream);
    source.addEventListener("output", (e) => {
      console.log("output", e);
      dispatchCurrentMessage({ type: "append", payload: e.data });
    });
    source.addEventListener("error", (e) => {
      source.close();
      setError(e.message);
    });
    setEventSource(source);

    dispatchCurrentMessage({ type: "reset" });

    return () => {
      source.close();
      clearInterval(intervalRef.current);
    };
  }, [prediction]);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, prediction]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (currentMessage.displayed.length < currentMessage.buffer.length) {
        dispatchCurrentMessage({ type: "display" });
      } else {
        clearInterval(intervalRef.current);
      }
    }, 5);

    return () => {
      clearInterval(intervalRef.current);
    };
  }, [currentMessage.buffer, currentMessage.displayed.length]);

  return (
    <div className="font-serif">
      <Head>
        <title>Llama Chat</title>
      </Head>
      <nav class="flex w-full justify-end p-3">
        <a
          className="rounded-md mr-3 inline-flex items-center bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          href="https://replicate.com/a16z-infra/llama13b-v2-chat?utm_source=project&utm_campaign=llamachat"
        >
          Run Llama Yourself
        </a>
        <button
          type="button"
          className="rounded-md inline-flex items-center bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          onClick={() => setOpen(true)}
        >
          <Cog6ToothIcon
            className="h-5 w-5 text-gray-500 group-hover:text-gray-900"
            aria-hidden="true"
          />{" "}
        </button>
      </nav>

      <div className="max-w-2xl pb-5 mx-auto">
        <h1 className="text-center font-bold text-2xl">
          Chat with a{" "}
          <a href="https://replicate.com/a16z-infra/llama13b-v2-chat?utm_source=project&utm_compaign=llamachat">
            Llama
          </a>
        </h1>

        {/* {messages.length == 0 && <EmptyState setPrompt={setPrompt} />} */}

        <SlideOver
          open={open}
          setOpen={setOpen}
          systemPrompt={systemPrompt}
          handleSubmit={handleSettingsSubmit}
        />

        <ChatForm
          prompt={prompt}
          setPrompt={setPrompt}
          onSubmit={handleSubmit}
        />

        {error && <div>{error}</div>}

        <div className="pb-24">
          {messages.map((message, index) => (
            <Message
              key={`message-${index}`}
              message={message.text}
              isUser={message.isUser}
            />
          ))}
          {loading && <LoadingChatLine />}

          {currentMessage.displayed && currentMessage.displayed.length > 0 && (
            <Message message={currentMessage.displayed} isUser={false} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
