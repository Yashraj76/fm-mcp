import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
export const GET = withAuth(async (req, { params, userId }) => {
    return NextResponse.json({ message: "Hello, world!" });
    });
