import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Rating,
  Alert,
  Snackbar,
  CircularProgress
} from "@mui/material";
import { Delete as DeleteIcon } from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { PERMISSIONS } from "../config/permissions";
import api from "../services/api";

interface Review {
  id: number;
  name: string;
  role: string;
  content: string | null;
  text: string | null;
  rating: number | null;
  stars: number | null;
  approved: boolean;
  date: string;
  company: string | null;
  location: string | null;
}

export default function Reviews() {
  const { hasPermission } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await api.get("/api/reviews");
      setReviews(response.data || []);
      setError(null);
    } catch (err: any) {
      console.error("Failed to fetch reviews:", err);
      setError("Failed to load reviews.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this review?")) return;
    try {
      await api.delete(`/api/reviews/${id}`);
      setSuccessMsg("Review deleted successfully.");
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      console.error("Failed to delete review:", err);
      setError("Failed to delete review.");
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Reviews
      </Typography>
      <Card sx={{ borderRadius: 2, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
        <CardContent sx={{ p: 0 }}>
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "rgba(0,0,0,0.02)" }}>
                  <TableCell><strong>ID</strong></TableCell>
                  <TableCell><strong>Name</strong></TableCell>
                  <TableCell><strong>Role / Company</strong></TableCell>
                  <TableCell><strong>Rating</strong></TableCell>
                  <TableCell><strong>Review Text</strong></TableCell>
                  <TableCell><strong>Date</strong></TableCell>
                  <TableCell align="center"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reviews.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                      <Typography color="textSecondary">No reviews found.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  reviews.map((review) => (
                    <TableRow key={review.id} hover>
                      <TableCell>{review.id}</TableCell>
                      <TableCell>{review.name || "N/A"}</TableCell>
                      <TableCell>
                        {review.role || "N/A"}
                        {review.company && ` at ${review.company}`}
                      </TableCell>
                      <TableCell>
                        <Rating value={review.rating ?? review.stars ?? 0} readOnly size="small" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="textSecondary" sx={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {review.content || review.text || "No text"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {review.date ? new Date(review.date).toLocaleDateString() : "N/A"}
                      </TableCell>
                      <TableCell align="center">
                        {hasPermission(PERMISSIONS.DELETE_REVIEWS) && (
                          <Tooltip title="Delete Review">
                            <IconButton color="error" onClick={() => handleDelete(review.id)}>
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)}>
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: "100%" }}>
          {error}
        </Alert>
      </Snackbar>

      <Snackbar open={!!successMsg} autoHideDuration={6000} onClose={() => setSuccessMsg(null)}>
        <Alert onClose={() => setSuccessMsg(null)} severity="success" sx={{ width: "100%" }}>
          {successMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
