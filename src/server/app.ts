import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// Proxy to get token
app.post("/api/yingdao/token", async (req, res) => {
  try {
    const { accessKeyId, accessKeySecret } = req.body;
    const response = await axios.get(
      `https://api.yingdao.com/oapi/token/v2/token/create?accessKeyId=${accessKeyId}&accessKeySecret=${accessKeySecret}`,
      {
        headers: {
          "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
          "Accept": "*/*",
          "Host": "api.yingdao.com",
          "Connection": "keep-alive"
        }
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error("Token error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Proxy to get schedule list
app.post("/api/yingdao/schedule/list", async (req, res) => {
  try {
    const { token, payload } = req.body;
    const response = await axios.post(
      `https://api.winrobot360.com/oapi/dispatch/v2/schedule/list`,
      payload || {},
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Host": "api.winrobot360.com",
          "Connection": "keep-alive"
        }
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error("List error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Proxy to get schedule detail
app.post("/api/yingdao/schedule/detail", async (req, res) => {
  try {
    const { token, scheduleUuid } = req.body;
    const response = await axios.post(
      `https://api.winrobot360.com/oapi/dispatch/v2/schedule/detail`,
      { scheduleUuid },
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Host": "api.winrobot360.com",
          "Connection": "keep-alive"
        }
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error("Detail error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Proxy to get task history list
app.post("/api/yingdao/task/list", async (req, res) => {
  try {
    const { token, payload } = req.body;
    const response = await axios.post(
      `https://api.winrobot360.com/oapi/dispatch/v2/task/list`,
      payload || {},
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Host": "api.winrobot360.com",
          "Connection": "keep-alive"
        }
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error("Task list error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Proxy to get client list
app.post("/api/yingdao/client/list", async (req, res) => {
  try {
    const { token, payload } = req.body;
    const response = await axios.post(
      `https://api.yingdao.com/oapi/dispatch/v2/client/list`,
      payload || {},
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Host": "api.yingdao.com",
          "Connection": "keep-alive"
        }
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error("Client list error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Proxy to get client group list
app.post("/api/yingdao/client/group/list", async (req, res) => {
  try {
    const { token, payload } = req.body;
    const response = await axios.post(
      `https://api.yingdao.com/oapi/dispatch/v2/client/group/list`,
      payload || {},
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Host": "api.yingdao.com",
          "Connection": "keep-alive"
        }
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error("Client group list error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

export default app;
