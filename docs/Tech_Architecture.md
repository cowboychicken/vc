> **Status: superseded.** The MVP is a browser-only TypeScript app with no backend (see [plan.md](./plan.md)). The notes below are the original exploratory proposal and are kept for reference.

Project: VC Card Game & RL AI  
Primary Goal: Local-first, offline-capable architecture for development, self-play training, and inference.

1. Development Environment

Local OS: Ubuntu 22.04 LTS via WSL.  
Virtual Environment: pyenv managing isolated Python versions.  
Agentic Tools: Cursor IDE and Claude Code CLI (\~/.local/bin/claude) for executing logic generation.

1. Application Stack

Game Engine: Pure Python (Zero web dependencies). Handles deck, shuffling, turn validation, and win conditions.  
Backend API: FastAPI running via Uvicorn. Exposes the Python game engine to local web clients via REST HTTP POST requests.  
Frontend UI: React (or Vanilla JS) communicating with the local FastAPI endpoints.  
Containerization: Docker will eventually wrap the FastAPI app, the trained AI model, and the compiled frontend into a single image.

1. AI & Machine Learning Pipeline

Environment Wrapper: Gymnasium (Standardizes the Python game engine into observation/action spaces).  
Training Algorithm: Proximal Policy Optimization (PPO) via Stable-Baselines3.  
Training Hardware: Lenovo ThinkCentre M75q Gen 2 Tiny (AMD Ryzen, Windows/Linux). Used as a dedicated 24/7 self-play training server to run the PPO loops offline.  
Model Export: .pt or .onnx format, loaded into the FastAPI startup event for live inference against human players.  
