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
    console.error("List error:", JSON.stringify(error.response?.data || error.message));
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Proxy to get schedule detail
app.post("/api/yingdao/schedule/detail", async (req, res) => {
  try {
    const { token, scheduleUuid } = req.body;
    const response = await axios.post(
      `https://api.yingdao.com/oapi/dispatch/v2/schedule/detail`,
      { scheduleUuid },
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
    console.error("Detail error:", JSON.stringify(error.response?.data || error.message));
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Proxy to get task history list
app.post("/api/yingdao/task/list", async (req, res) => {
  try {
    const { token, payload } = req.body;
    
    try {
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
      return res.json(response.data);
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.status === 401 || err.response?.status === 400) {
        // Fallback to yingdao.com
        const response2 = await axios.post(
          `https://api.yingdao.com/oapi/dispatch/v2/task/list`,
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
        return res.json(response2.data);
      }
      throw err;
    }
  } catch (error: any) {
    console.error("Task list error:", JSON.stringify(error.response?.data || error.message));
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Proxy to get task query (for start/end times)
app.post("/api/yingdao/task/query", async (req, res) => {
  try {
    const { token, taskUuid } = req.body;
    const response = await axios.post(
      `https://api.yingdao.com/oapi/dispatch/v2/task/query`,
      { taskUuid },
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
    console.error("Task query error:", JSON.stringify(error.response?.data || error.message));
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
    console.error("Client list error:", JSON.stringify(error.response?.data || error.message));
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
    console.error("Client group list error:", JSON.stringify(error.response?.data || error.message));
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

export default app;
