<script lang="ts">
  import { onMount } from "svelte"; //imports onMount
  import NotLoggedIn from "../components/notLoggedIn.svelte"; //imports NotLoggedIn component
  import {
    toasts,
    ToastContainer as ToastContainerAny,
    FlatToast as FlatToastAny,
  } from "svelte-toasts"; //imports toasts, toastContainer and flatToast to show toasts

  import Loader from "../components/loader.svelte"; // imports Loader from components
  import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
  } from "@google/generative-ai"; // imports GoogleGenerativeAI
  import { GradeAppDatabase } from "../supabaseClient";
  import HighlightedContent from "../components/highlightedContent.svelte";
  import { race } from "./utils";

  let name = "User"; //declares name variable with default value of "User"
  let membership = "free"; //declares member variable with default value of "false"
  let notLoggedIn = false; //declares notLoggedIn variable with default value of false
  let userEmail = ""; //declares userEmail variable with default value of ""
  let messages: any = []; // array to store user and ai messages
  let messagesForTTS = [];
  let userInput = ""; // variable to store user message
  let GeminiInput = ""; // variable to store ai message
  let shouldShowWelcomeMessage = true; // shouldShowWelcomeMessage is true by default to show shouldShouldWelcomeMessage
  let shouldload = false; // shouldload is false by default to not show loader
  let speakButton = true;
  let pauseButton = false;
  let resumeButton = false;
  let stopButton = false;
  let selectedModel: string;
  let user: string = "User";
  const socraticModelSystemPrompt =
    "You are a Socratic Teacher. And I am your student. And please try to keep your replies as brief as possible, while explaining each topic carefully. Please Exlain the topic in relation to the NCERT CBSE 2024 curriculum. Please don't give the answer directly but rather a starting point to get started, you job is to help the student find the answer on his/her own way.";
  const baseModelSystemPrompt = "You are a Large Language model named Grade-AI";
  let systemPrompt = baseModelSystemPrompt;
  let modelName: "gemini-1.5-pro" | "gemini-1.5-flash-8b" =
    "gemini-1.5-flash-8b";
  const socraticConfig = {
    temperature: 0,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
  };
  const BaseConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
  };
  let generationConfig = BaseConfig;
  const ToastContainer = ToastContainerAny as any;
  const FlatToast = FlatToastAny as any;

  const showToast = (
    title: string,
    body: string,
    duration: number,
    type: string
  ) => {
    const toast = toasts.add({
      title: title,
      description: body,
      duration: duration,
      placement: "bottom-right",
      //@ts-ignore
      type: "info",
      theme: "dark",
      //@ts-ignore
      placement: "bottom-right",
      showProgress: true,
      //@ts-ignore
      type: type,
      //@ts-ignore
      theme: "dark",
      onClick: () => {},
      onRemove: () => {},
    });
  };
  onMount(async () => {
    //checks if user is logged in by is Display Name exists in sessionStorage
    if (sessionStorage.getItem("Display Name")) {
      //@ts-ignore
      name = sessionStorage.getItem("Display Name"); //sets name variable to the display name from sessionstorage
      membership = String(sessionStorage.getItem("Membership")); //sets member variable to the member status from sessionstorage
    } else {
      //if display name does not exist in sessionStorage
      //@ts-ignore
      name = sessionStorage.getItem("Email"); //sets name variable to the email from sessionstorage
      membership = String(sessionStorage.getItem("Membership")); //sets member variable to the member status from sessionstorage
      //@ts-ignore
      userEmail = sessionStorage.getItem("Email"); //sets userEmail to the email from sessionstorage
    }
    //checks if name is null
    if (name == null || !userEmail) {
      notLoggedIn = true; //sets notLoggedIn to true
    } else {
      if (name) {
        user = name;
      } else if (userEmail) {
        user = userEmail;
      }

      try {
        initializeEverything();
        await getUserMessagesFromDb(userEmail);
        const chatlog = document.getElementById("chatlog");
        if (chatlog) {
          chatlog.scrollTo(0, chatlog.scrollHeight);
        }
      } catch (error) {
        console.log(`Error during initialization: ${error}`);
      }
    }
  });
  function speak(text: string) {
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices[18];
    if (text) {
      pauseButton = true;
      try {
        speechSynthesis.speak(utterance);
        utterance.onend = () => {
          pauseButton = false;
          resumeButton = false;
          stopButton = false;
        };
      } catch {
        showToast(
          "Error",
          "Speech synthesis could not be generated",
          3000,
          "failure"
        );
        setTimeout(() => {
          pauseButton = false;
          resumeButton = false;
          stopButton = false;
        }, 3000);
      }
    }
  }
  async function getUserMessagesFromDb(userEmail: string) {
    try {
      const fetchMessages = async () => {
        const { data, error } = await GradeAppDatabase.from("User-messages")
          .select()
          .eq("user", userEmail)
          .order("created_at", { ascending: true });
        if (error) throw error;
        return data;
      };
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 5000)
      );

      const data = await race([fetchMessages(), timeout]);

      if (data) {
        //@ts-ignore
        if (data.length > 0) {
          // Changed from data != ""
          let newMessages = []; // Declare newMessages here
          //@ts-ignore
          for (const row of data) {
            newMessages.push({ content: row.prompt, sender: user });
            newMessages.push({
              content: row.response.replace(/\*\*/g, "<br>"),
              sender: `Gemini-${selectedModel || "Base Model"}`,
            });
          }
          messages = newMessages; // Replace instead of concatenating
          localStorage.setItem("messages", JSON.stringify(messages));
          shouldShowWelcomeMessage = false;
        }
      }
    } catch (error) {
      console.log(`Database fetch error: ${error}`);
      showToast(
        "Warning",
        "Fetching messages took too long. Using local messages.",
        2500,
        "warning"
      );
      const messagesInLocalStorage = localStorage.getItem("messages");
      if (messagesInLocalStorage) {
        messages = JSON.parse(messagesInLocalStorage);
        shouldShowWelcomeMessage = false;
      }
    }
  }
  function speakText() {
    if (messages[messages.length - 1].sender == "Gemini") {
      speak(messages[messages.length - 1].content);
    }
  }
  function pauseSpeech() {
    pauseButton = false;
    resumeButton = true;
    speechSynthesis.pause();
  }
  function resumeSpeech() {
    resumeButton = false;
    pauseButton = true;
    speechSynthesis.resume();
  }
  function handleKeyDown(event: any) {
    // function to handle key down
    if (event.key === "Enter" && !event.shiftKey) {
      // condition to check if key pressed is Enter
      event.preventDefault();
      sendMessage(); // if condition is true sendMessage function runs
    }
  }
  async function writeDataInDb(prompt: string, response: string) {
    const email = sessionStorage.getItem("Email");
    try {
      const { data, error } = await GradeAppDatabase.from(
        "User-messages"
      ).insert({
        user: email,
        prompt: prompt,
        response: response,
        created_at: new Date().toISOString(),
      });
      if (error) {
        console.log(error);
        // Handle the error appropriately
        return; // Or throw an exception if needed
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      // Handle unexpected errors gracefully
    }
  }
  function sendMessage() {
    // function to send messages to API
    shouldShowWelcomeMessage = false; // sets shouldShowWelcomeMessage to false to not show welcome message

    const userInputElement = document.getElementById(
      "userInput"
    ) as HTMLInputElement; // gets user input
    const userInput = userInputElement.value.trim(); // gets user input

    messages = [...messages, { content: userInput, sender: user }]; // add user input to messages
    const chatLog = document.getElementById("chatlog");
    if (chatLog) {
      chatLog.scrollTo(0, chatLog.scrollHeight);
    }
    if (userInput == "") {
      // checks if userInput is empty
      messages = [
        ...messages,
        {
          content: "Sorry, you didn't enter a prompt!",
          sender: `Gemini-${selectedModel}`,
        }, // returns error message
      ]; // add userinput to messages
    } else {
      // if userInput is not empty
      run(userInput).then(() => {
        const chatLog = document.getElementById("chatlog");
        setTimeout(() => {
          if (chatLog) {
            chatLog.scrollTo(0, chatLog.scrollHeight);
          }
        }, 500);
      });
    }
    userInputElement.value = ""; // removes old message from the input
  }
  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ];
  let chatSession: any;
  async function getApiKey() {
    const { data, error } = await GradeAppDatabase.from("API-Key").select();
    if (data) {
      return data[0].API_KEY;
    } else {
      console.log(error);
    }
  }
  async function initializeEverything() {
    const API_KEY = await getApiKey();
    try {
      const genAI = new GoogleGenerativeAI(API_KEY); // generates a new ai to using the api key to get responses
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
        }); // generates a new model using genAI
        console.log(model);
        try {
          chatSession = model.startChat({
            generationConfig,
            safetySettings,
            history: [],
          });
        } catch (error) {
          console.log(`Error setting up chatSession: ${error}`);
        }
      } catch (error) {
        console.log(`Error setting up model: ${error}`);
      }
    } catch (error) {
      console.log(`Error initializing AI: ${error}`);
    }
  }
  async function run(prompt: string) {
    if (chatSession) {
      try {
        shouldload = true; // sets shouldload to true to show loader
        const result = await chatSession.sendMessage(prompt);
        const text = result.response.text();
        shouldload = false; // sets shouldload to false to not show loader

        const formattedText = text // variable to store formatted text
          .replace(/\*\*/g, "") // replaces "**" with ""
          .replace(/\*/g, ""); // replaces "*" with ""

        // Create a single message with line breaks
        const message = {
          content: formattedText,
          sender: `Gemini-${selectedModel}`,
        }; // stores formatted AI text in message

        messages = [...messages, message]; // appends formatted text to messages
        await writeDataInDb(prompt, text);
        const chatLog = document.getElementById("chatlog");
        if (chatLog) {
          chatLog.scrollTo(0, chatLog.scrollHeight);
        }
      } catch (error) {
        console.log(`Error sending message: ${error}`);
        messages = [
          ...messages,
          {
            content: `Sorry, something went wrong! Error Message: ${error}`,
            sender: `Gemini-${selectedModel}`,
          },
        ];
        shouldload = false;
      }
    } else {
      initializeEverything();
    }
  }
  function autoResize(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }
  async function gradeAiSocratic() {
    //checks if member is true
    // if (membership == "tier-2") {
    systemPrompt = socraticModelSystemPrompt;
    modelName = "gemini-1.5-pro";
    // } else {
    //   showToast(
    //     "Error",
    //     "Sorry you do not own a tier-2 account needed to access this model.",
    //     3500,
    //     "error"
    //   );
    // }
  }
  async function gradeAiBase() {
    //checks if member is true
    // if (membership == "tier-1" || membership == "tier-2") {
    systemPrompt = baseModelSystemPrompt;
    modelName = "gemini-1.5-flash-8b";
    // } else {
    //   showToast(
    //     "Error",
    //     "Sorry you do not own a tier-1 account needed to access this model.",
    //     3500,
    //     "error"
    //   );
    // }
  }
  function changeModel() {
    if (selectedModel == "Socratic Model") {
      gradeAiSocratic();
    } else if (selectedModel == "Base Model") {
      gradeAiBase();
    }
  }
</script>

<svelte:component this={ToastContainer} let:data>
  <svelte:component this={FlatToast} {data} />
</svelte:component>

<svelte:head>
  <title>Grade AI</title>
</svelte:head>

{#if !notLoggedIn}
  <div class="main">
    <div class="nav">
      <div class="model-selection">
        <select
          bind:value={selectedModel}
          on:change={changeModel}
          class="dropdown-content menu bg-base-500 z-[1] p-2 shadow mb-2"
        >
          <option>Base Model</option>
          <option>Socratic Model</option>
        </select>
      </div>
      <div class="title">
        <h1>Grade-AI(Powered by Google's Gemini)</h1>
      </div>
    </div>
    <div class="chatlog" id="chatlog">
      {#if shouldShowWelcomeMessage}
        <div class="welcome-message mt-10">
          <h1 id="hello-message" class="text-7xl text-white">Hello There!</h1>
          <p class="text-2xl">How Can I Help You Today?</p>
        </div>
      {/if}
      {#each messages as userMessage}
        <div class={userMessage.sender === user ? "User" : "Gemini"}>
          <div class="senders">
            <h3 class="text-white pl-2">{userMessage.sender}:</h3>
          </div>
          <div class="content pl-5 text-gray-200">
            {#if userMessage.sender.startsWith("Gemini")}
              <div>
                <HighlightedContent content={userMessage.content} />
              </div>
            {:else}
              <p>{userMessage.content}</p>
            {/if}
          </div>
        </div>
      {/each}
      {#if shouldload}
        <div class="loader pl-2 mt-3">
          <Loader />
        </div>
      {/if}
    </div>
    <div class="input-area">
      <textarea
        id="userInput"
        placeholder="Enter a prompt here"
        on:keydown={handleKeyDown}
        on:input={autoResize}
        rows="1"
      ></textarea>
      <div class="tooltip" data-tip="Send">
        <button type="button" class="btn" on:click={sendMessage}
          ><svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 448 512"
            width="30px"
            fill="grey"
            ><!--!Font Awesome Free 6.7.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path
              d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"
            /></svg
          ></button
        >
      </div>
      {#if speakButton}
        <div class="tooltip" data-tip="Speak">
          <button type="button" class="btn" on:click={speakText}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 640 512"
              width="30px"
              ><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path
                fill="grey"
                d="M533.6 32.5C598.5 85.2 640 165.8 640 256s-41.5 170.7-106.4 223.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C557.5 398.2 592 331.2 592 256s-34.5-142.2-88.7-186.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM473.1 107c43.2 35.2 70.9 88.9 70.9 149s-27.7 113.8-70.9 149c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C475.3 341.3 496 301.1 496 256s-20.7-85.3-53.2-111.8c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zm-60.5 74.5C434.1 199.1 448 225.9 448 256s-13.9 56.9-35.4 74.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C393.1 284.4 400 271 400 256s-6.9-28.4-17.7-37.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM301.1 34.8C312.6 40 320 51.4 320 64l0 384c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352 64 352c-35.3 0-64-28.7-64-64l0-64c0-35.3 28.7-64 64-64l67.8 0L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3z"
              /></svg
            >
          </button>
        </div>
      {/if}
      {#if pauseButton}
        <div class="tooltip" data-tip="Pause"></div>
        <button type="button" class="btn" on:click={pauseSpeech}
          ><svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 320 512"
            width="30px"
            ><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path
              fill="grey"
              d="M48 64C21.5 64 0 85.5 0 112L0 400c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48L48 64zm192 0c-26.5 0-48 21.5-48 48l0 288c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48l-32 0z"
            /></svg
          ></button
        >
      {/if}
      {#if resumeButton}
        <div class="tooltip" data-tip="Resume">
          <button type="button" class="btn" on:click={resumeSpeech}
            ><svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 384 512"
              width="30px"
              ><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path
                fill="grey"
                d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80L0 432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"
              /></svg
            ></button
          >
        </div>
      {/if}
    </div>
  </div>
{/if}
{#if notLoggedIn}<NotLoggedIn />{/if}

<style>
  :root {
    --border-color: rgb(168, 168, 168);
  }
  .main {
    overflow: hidden;
  }
  .User {
    width: 50em;
    background-color: #3e3f41;
    border-radius: 10px;
    align-self: flex-end;
    padding-bottom: 10px;
    padding-right: 10px;
    margin-left: auto;
    margin-bottom: 10px;
    max-width: 700px;
  }
  .Gemini {
    width: fit-content;
    max-width: 1500px;
    background-color: #2a2b2d;
    border-radius: 10px;
    padding-bottom: 10px;
    padding-right: 10px;
    margin-bottom: 10px;
  }
  #hello-message {
    background: linear-gradient(
      90deg,
      rgba(72, 148, 229) 0%,
      rgba(138, 121, 203) 70%
    );
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .welcome-message {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    gap: 10px;
    height: 100%;
  }
  .senders {
    font-size: 1.3em;
  }
  .content {
    font-size: 1.1em;
  }
  .model-selection {
    padding-top: 5px;
    padding-left: 10px;
  }
  .model-selection select {
    border-radius: 10px;
  }
  .chatlog {
    max-height: calc(
      100vh - 70px
    ); /* Adjust this value based on the height of your text area */
    overflow-y: scroll;
    padding-left: 10px;
    padding-right: 10px;
    margin-top: 5px;
  }
  .nav {
    display: flex;
    justify-content: space-between; /* Adjusts spacing between items */
    align-items: center; /* Centers items vertically */
    position: fixed;
    background-color: var(--base-200);
    backdrop-filter: blur(3px);
    width: 100vw;
  }
  .nav .title {
    position: relative;
    flex: 1; /* Allows the title to take available space */
    text-align: center; /* Centers the text within the title div */
    font-weight: bold;
  }
  textarea {
    min-height: 10px;
    max-height: 60px;
    height: 45px;
    width: 1000px;
    border-radius: 5px;
    border: 0.1em solid var(--border-color);
    background-color: #1b1b1b;
    color: white;
    padding-left: 5px;
    padding-right: 5px;
    resize: none;
    overflow-y: scroll;
  }
  button {
    border-radius: 10px;
    border: 0.1em solid var(--border-color);
  }
  .input-area {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    background-color: #121213;
    padding-top: 10px;
    padding-bottom: 10px;
  }
</style>
